// apps/memroos/src/lib/connectors/__tests__/store.test.ts
// Connector ingestion — the two failure modes that are silent in production.

import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { createSpace, filterBySpace } from "@/lib/space";

import { CONNECTOR_MANIFESTS, getManifest, connectorProject } from "../manifest";
import {
  backfillConnectorSpaceReaders,
  connectorAgentId,
  ensureConnectorSpace,
  readSyncState,
  writeConnectorRecord,
  writeSyncState,
} from "../store";

const LINEAR = getManifest("linear")!;
const ISSUES = LINEAR.tools.find((t) => t.tool === "list_issues")!;

let db: Database.Database;

function setup() {
  const fresh = new Database(":memory:");
  initSchema(fresh);
  return fresh;
}

beforeEach(() => {
  db = setup();
});

describe("connectors/store", () => {
  it("creates the connector space with indexable labels", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });

    expect(spaceId).toBeTruthy();
    // The whole point: rows inherit these, and messages_fts only indexes
    // policy='indexable' with a non-private visibility.
    expect(labels.policy).toBe("indexable");
    expect(labels.visibility).toBe("internal");
  });

  it("is idempotent — a second cycle reuses the space rather than throwing", () => {
    const a = ensureConnectorSpace(db, { tenantId: "default-tenant", providerKey: "linear" });
    // createSpace throws on duplicate (tenant_id, name); the job runs every
    // 15 minutes, so a non-idempotent ensure would fail on run two.
    const b = ensureConnectorSpace(db, { tenantId: "default-tenant", providerKey: "linear" });
    expect(b.spaceId).toBe(a.spaceId);
  });

  it("registers the synthetic connector agent as a space member", () => {
    const { spaceId } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const row = db
      .prepare(
        `SELECT member_type FROM space_members WHERE space_id = ? AND member_id = ?`,
      )
      .get(spaceId, connectorAgentId("linear")) as { member_type: string } | undefined;
    expect(row?.member_type).toBe("agent");
  });

  /**
   * FAILURE MODE 1: labels default to policy='sealed', visibility='private'.
   * A row written with defaults embeds but never reaches messages_fts — it
   * looks indexed and is unfindable. This asserts the row actually lands in
   * the FTS index.
   */
  it("a written record is full-text searchable", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });

    const outcome = writeConnectorRecord({
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: ISSUES,
      record: {
        id: "ENG-95",
        title: "Scoping API rework",
        description: "Pass scope into find() instead of construction-time binding",
        updatedAt: "2026-07-27T00:00:00Z",
      },
    });
    expect(outcome.status).toBe("written");

    const hits = db
      .prepare(`SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?`)
      .all("Scoping");
    expect(hits.length).toBe(1);
  });

  it("sealed space labels keep content out of the FTS index", () => {
    // The operator lever: tightening a space stops content being searchable
    // without breaking ingestion.
    const sealed = createSpace(db, {
      tenantId: "default-tenant",
      name: "connector/sealed",
      defaultLabels: { policy: "sealed", visibility: "private" },
    });

    writeConnectorRecord({
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId: sealed.id,
      labels: { policy: "sealed", visibility: "private" },
      tool: ISSUES,
      record: { id: "ENG-1", title: "Secret roadmap", updatedAt: "2026-07-27T00:00:00Z" },
    });

    const hits = db
      .prepare(`SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?`)
      .all("Secret");
    expect(hits.length).toBe(0);
  });

  /**
   * FAILURE MODE 2: filterBySpace falls back to matching `project` against the
   * space NAME when space_id is null or mismatched. A connector row must not
   * leak into an unrelated space through that fallback.
   */
  it("a connector row does not leak into another space", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const other = createSpace(db, { tenantId: "default-tenant", name: "engineering" });

    writeConnectorRecord({
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: ISSUES,
      record: { id: "ENG-95", title: "Private issue", updatedAt: "2026-07-27T00:00:00Z" },
    });

    const rows = db
      .prepare(`SELECT space_id, project FROM messages`)
      .all() as Array<{ space_id: string | null; project: string }>;

    // Every connector row carries a real space_id — never null, which is what
    // would trigger the project-name fallback.
    expect(rows.every((r) => r.space_id !== null)).toBe(true);

    const visibleInOther = filterBySpace(rows, "engineering", other.id);
    expect(visibleInOther).toEqual([]);
  });

  it("namespaces project so it cannot collide with a space name", () => {
    // A bare "linear" project would match a space named "linear" through the
    // filterBySpace fallback.
    expect(connectorProject("linear")).toBe("connector/linear");
    expect(connectorProject("linear")).toContain("/");
  });

  it("re-syncing an unchanged record is a no-op, not a duplicate", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const record = {
      id: "ENG-95",
      title: "Scoping API rework",
      updatedAt: "2026-07-27T00:00:00Z",
    };
    const args = {
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: ISSUES,
      record,
    };

    expect(writeConnectorRecord(args).status).toBe("written");
    expect(writeConnectorRecord(args).status).toBe("duplicate");

    const count = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("quarantines a record carrying a credential", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });

    const outcome = writeConnectorRecord({
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: ISSUES,
      record: {
        id: "ENG-96",
        title: "Deploy notes",
        description: "AKIAIOSFODNN7EXAMPLE is the key, also sk-abcdefghijklmnopqrstuvwxyz012345",
        updatedAt: "2026-07-27T00:00:00Z",
      },
    });

    // Untrusted provider content must not become agent-readable memory.
    expect(["quarantined", "review_required"]).toContain(outcome.status);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("skips records with no id or no content", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const base = { db, providerKey: "linear", connectionId: "c", spaceId, labels, tool: ISSUES };

    expect(writeConnectorRecord({ ...base, record: { title: "no id" } }).status).toBe("empty");
    expect(writeConnectorRecord({ ...base, record: { id: "X-1" } }).status).toBe("empty");
  });
});

describe("connectors/sync-state", () => {
  it("round-trips the high-water mark", () => {
    expect(readSyncState(db, "conn-1", "list_issues")).toEqual({
      cursorValue: null,
      pageCursor: null,
    });

    writeSyncState(db, {
      connectionId: "conn-1",
      providerKey: "linear",
      tool: "list_issues",
      cursorValue: "2026-07-27T00:00:00Z",
      pageCursor: null,
      status: "ok",
      rowsWritten: 12,
    });

    expect(readSyncState(db, "conn-1", "list_issues")).toEqual({
      cursorValue: "2026-07-27T00:00:00Z",
      pageCursor: null,
    });
  });

  it("accumulates rows_written across cycles", () => {
    const base = {
      connectionId: "conn-1",
      providerKey: "linear",
      tool: "list_issues",
      cursorValue: null,
      pageCursor: null,
      status: "ok",
    };
    writeSyncState(db, { ...base, rowsWritten: 10 });
    writeSyncState(db, { ...base, rowsWritten: 5 });

    const row = db
      .prepare(`SELECT rows_written FROM connector_sync_state WHERE connection_id = ?`)
      .get("conn-1") as { rows_written: number };
    expect(row.rows_written).toBe(15);
  });
});

/**
 * Regression tests for defects an adversarial validation pass confirmed on
 * 2026-07-27. Each of these was a real, silent failure.
 */
describe("connectors/store — validated regressions", () => {
  it("an EDITED record overwrites rather than being discarded", () => {
    // Was INSERT OR IGNORE: a rewritten issue body conflicted on
    // UNIQUE(session_id, request_id) and was silently thrown away, so memory
    // served the first-ever version forever and the incremental fetch was moot.
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const base = {
      db,
      providerKey: "linear",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: ISSUES,
    };

    writeConnectorRecord({
      ...base,
      record: { id: "ENG-1", title: "Original", updatedAt: "2026-07-01T00:00:00Z" },
    });
    const second = writeConnectorRecord({
      ...base,
      record: { id: "ENG-1", title: "REWRITTEN", updatedAt: "2026-07-27T00:00:00Z" },
    });
    expect(second.status).toBe("written");

    const row = db
      .prepare(`SELECT content, timestamp FROM messages WHERE request_id = ?`)
      .get("ENG-1") as { content: string; timestamp: string };
    expect(row.content).toContain("REWRITTEN");
    expect(row.timestamp).toBe("2026-07-27T00:00:00Z");

    const n = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get() as { n: number };
    expect(n.n).toBe(1);
  });

  it("an OLDER copy cannot clobber a newer stored record", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "linear",
    });
    const base = { db, providerKey: "linear", connectionId: "c", spaceId, labels, tool: ISSUES };

    writeConnectorRecord({
      ...base,
      record: { id: "ENG-1", title: "Newer", updatedAt: "2026-07-27T00:00:00Z" },
    });
    writeConnectorRecord({
      ...base,
      record: { id: "ENG-1", title: "Stale", updatedAt: "2026-07-01T00:00:00Z" },
    });

    const row = db
      .prepare(`SELECT content FROM messages WHERE request_id = ?`)
      .get("ENG-1") as { content: string };
    expect(row.content).toContain("Newer");
  });

  it("uses each provider's own timestamp field, not a hardcoded updatedAt", () => {
    // Circleback records carry createdAt and no updatedAt; Notion carries
    // last_edited_time. Hardcoding updatedAt collapsed both onto the ingest
    // date, corrupting recency ranking.
    const cb = getManifest("circleback")!;
    const meetings = cb.tools.find((t) => t.tool === "SearchMeetings")!;
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "circleback",
    });

    writeConnectorRecord({
      db,
      providerKey: "circleback",
      connectionId: "cb-1",
      spaceId,
      labels,
      tool: meetings,
      record: {
        id: "mtg-1",
        name: "Juan / Luis",
        notes: "GTM sequencing is the priority",
        createdAt: "2026-07-01T00:00:00Z",
      },
    });

    const row = db
      .prepare(`SELECT timestamp FROM messages WHERE request_id = ?`)
      .get("mtg-1") as { timestamp: string };
    expect(row.timestamp).toBe("2026-07-01T00:00:00Z");
  });
});

describe("connectors/manifest — provider coverage", () => {
  it("every manifest names a providerConfigKey that exists in Nango prod", () => {
    // Verified against GET https://api.nango.dev/integrations on 2026-07-27.
    // A manifest naming an absent integration fetches nothing, silently.
    const NANGO_PROD = [
      "circleback-mcp",
      "github",
      "google",
      "google-calendar-mcp",
      "google-drive",
      "google-mail",
      "linear-mcp",
      "mcp-generic",
      "notion",
      "slack-mcp",
    ];
    const orphans = CONNECTOR_MANIFESTS.filter(
      (m) => !NANGO_PROD.includes(m.providerConfigKey),
    ).map((m) => `${m.providerKey} -> ${m.providerConfigKey}`);
    expect(orphans).toEqual([]);
  });

  it("every tool declares an id and timestamp field", () => {
    for (const m of CONNECTOR_MANIFESTS) {
      for (const t of m.tools) {
        expect(t.idField.length).toBeGreaterThan(0);
        expect(t.timestampField.length).toBeGreaterThan(0);
      }
    }
  });

  it("rest manifests declare method and path", () => {
    for (const m of CONNECTOR_MANIFESTS.filter((x) => x.transport === "rest")) {
      for (const t of m.tools) {
        expect(t.method).toBeTruthy();
        expect(t.path).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Reader enrolment.
//
// Regression guard for a live near-miss: on cordant-hermes-01 all 401
// connector rows sat in four spaces whose only member was the synthetic
// writer agent. That was harmless while `space_id` was inert, but the moment
// the space gate started enforcing, every one of those rows became
// unrecallable by any real user or agent. Enrolment is what keeps the gate
// from being a silent outage.
// ---------------------------------------------------------------------------

describe("connectors/store — notion enrichment reaches the FTS index", () => {
  const NOTION = getManifest("notion")!;
  const SEARCH = NOTION.tools.find((t) => t.tool === "search")!;

  it("indexes the page body, not just the URL", () => {
    // The original defect: a Notion record whose only content was its URL is
    // in messages_fts but matches no semantic query. Assert the body is
    // actually searchable, which is the acceptance criterion — not merely
    // that a row was written.
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });

    const outcome = writeConnectorRecord({
      db,
      providerKey: "notion",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: SEARCH,
      record: {
        id: "page-1",
        url: "https://notion.so/page-1",
        last_edited_time: "2026-07-29T00:00:00Z",
        // What enrichRecord writes in the sync loop.
        _content: "Q3 Roadmap\n\nShip the connector recall lane by August.",
      },
    });
    expect(outcome.status).toBe("written");

    const hit = db
      .prepare(
        `SELECT m.id FROM messages_fts
         JOIN messages m ON m.id = messages_fts.rowid
         WHERE messages_fts MATCH 'connector'`
      )
      .all() as Array<{ id: number }>;
    expect(hit).toHaveLength(1);

    const stored = db
      .prepare(`SELECT content FROM messages WHERE id = ?`)
      .get(hit[0].id) as { content: string };
    expect(stored.content).toContain("Q3 Roadmap");
    // The URL still rides along as the way back to the source...
    expect(stored.content).toContain("https://notion.so/page-1");
    // ...exactly once, not duplicated by _content also carrying it.
    expect(stored.content.match(/https:\/\/notion\.so\/page-1/g)).toHaveLength(1);
  });

  it("upgrades an existing URL-only row once enrichment produces a body", () => {
    // REGRESSION: the upsert guard used to be `excluded.timestamp >
    // messages.timestamp` alone. Notion's timestamp is last_edited_time, so
    // for the 14 rows already stored as bare URLs the timestamps are EQUAL on
    // the next sync — the update was suppressed and those rows could never
    // gain their body. The rows that motivated the whole enrichment feature
    // were precisely the ones it could not fix.
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });
    const base = {
      id: "page-3",
      url: "https://notion.so/page-3",
      last_edited_time: "2026-07-29T00:00:00Z",
    };

    // First cycle: enrichment unavailable (throttled) -> URL-only.
    expect(
      writeConnectorRecord({
        db, providerKey: "notion", connectionId: "conn-1", spaceId, labels,
        tool: SEARCH, record: { ...base },
      }).status
    ).toBe("written");

    // Second cycle: same last_edited_time, but now enriched.
    const second = writeConnectorRecord({
      db, providerKey: "notion", connectionId: "conn-1", spaceId, labels,
      tool: SEARCH,
      record: { ...base, _content: "Q3 Roadmap\n\nShip the connector recall lane." },
    });
    expect(second.status).toBe("written");

    const stored = db
      .prepare(`SELECT content FROM messages WHERE request_id = 'page-3'`)
      .get() as { content: string };
    expect(stored.content).toContain("Q3 Roadmap");
  });

  it("still no-ops on a genuinely unchanged re-fetch", () => {
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });
    const record = {
      id: "page-4",
      url: "https://notion.so/page-4",
      last_edited_time: "2026-07-29T00:00:00Z",
      _content: "Same body",
    };
    writeConnectorRecord({
      db, providerKey: "notion", connectionId: "conn-1", spaceId, labels,
      tool: SEARCH, record: { ...record },
    });
    const again = writeConnectorRecord({
      db, providerKey: "notion", connectionId: "conn-1", spaceId, labels,
      tool: SEARCH, record: { ...record },
    });
    expect(again.status).toBe("duplicate");
  });

  it("falls back to the URL-only record when enrichment produced nothing", () => {
    // A page whose blocks could not be read must still be findable/linkable
    // rather than skipped as empty.
    const { spaceId, labels } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });

    const outcome = writeConnectorRecord({
      db,
      providerKey: "notion",
      connectionId: "conn-1",
      spaceId,
      labels,
      tool: SEARCH,
      record: {
        id: "page-2",
        url: "https://notion.so/page-2",
        last_edited_time: "2026-07-29T00:00:00Z",
      },
    });

    expect(outcome.status).toBe("written");
    const stored = db
      .prepare(`SELECT content FROM messages WHERE request_id = 'page-2'`)
      .get() as { content: string };
    expect(stored.content).toBe("https://notion.so/page-2");
  });
});

describe("connectors/store — reader enrolment", () => {
  function seedPrincipals(target: Database.Database) {
    target
      .prepare(
        `INSERT INTO users (id, email, display_name, password_hash, tenant_id)
         VALUES ('user-1', 'a@example.com', 'A', 'x', 'default-tenant')`
      )
      .run();
    target
      .prepare(
        `INSERT INTO registered_agents (id, name, role, platform, protocol)
         VALUES ('host:claude', 'claude', 'coder', 'claude-code', 'local')`
      )
      .run();
  }

  it("enrols tenant users and registered agents when the space is ensured", () => {
    seedPrincipals(db);
    const { spaceId } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });

    const members = db
      .prepare(`SELECT member_id FROM space_members WHERE space_id = ? ORDER BY member_id`)
      .all(spaceId) as Array<{ member_id: string }>;
    const ids = members.map((m) => m.member_id);

    expect(ids).toContain("user-1");
    expect(ids).toContain("host:claude");
    // The synthetic writer is still a member.
    expect(ids).toContain(connectorAgentId("notion"));
  });

  it("is idempotent across repeated sync cycles", () => {
    seedPrincipals(db);
    const { spaceId } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });
    ensureConnectorSpace(db, { tenantId: "default-tenant", providerKey: "notion" });
    ensureConnectorSpace(db, { tenantId: "default-tenant", providerKey: "notion" });

    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM space_members WHERE space_id = ?`)
      .get(spaceId) as { c: number };
    expect(count.c).toBe(3);
  });

  it("enrols principals registered AFTER the space already existed", () => {
    // The drift case: space created on an empty DB, users added later.
    const { spaceId } = ensureConnectorSpace(db, {
      tenantId: "default-tenant",
      providerKey: "notion",
    });
    seedPrincipals(db);

    expect(backfillConnectorSpaceReaders(db)).toBe(1);

    const ids = (
      db
        .prepare(`SELECT member_id FROM space_members WHERE space_id = ?`)
        .all(spaceId) as Array<{ member_id: string }>
    ).map((m) => m.member_id);
    expect(ids).toContain("user-1");
    expect(ids).toContain("host:claude");
  });

  it("backfill ignores non-connector spaces", () => {
    seedPrincipals(db);
    const other = createSpace(db, { tenantId: "default-tenant", name: "team/eng" });
    ensureConnectorSpace(db, { tenantId: "default-tenant", providerKey: "notion" });

    backfillConnectorSpaceReaders(db);

    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM space_members WHERE space_id = ?`)
      .get(other.id) as { c: number };
    expect(count.c).toBe(0);
  });
});
