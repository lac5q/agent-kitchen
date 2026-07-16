// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { buildCanonicalIdentity } from "@/lib/memory/canonical";
import { coordinateErasure, listRegisteredErasureStores } from "@/lib/memory/erasure";
import { ensureMessageMemorySchema } from "@/lib/message-memory/store";
import { responseCache } from "@/lib/response-cache";

let db: Database.Database | null = null;

function freshDb(): Database.Database {
  db = new Database(":memory:");
  initSchema(db);
  ensureMessageMemorySchema(db);
  return db;
}

afterEach(() => {
  responseCache.purge();
  db?.close();
  db = null;
});

describe("MEMLIFE-02 real erasure store adapters", () => {
  it("registers real adapters for previously-placeholder stores", () => {
    const registered = listRegisteredErasureStores();
    for (const storeId of ["graph", "fts", "cache", "context", "candidates", "platform", "message", "salience"]) {
      expect(registered).toContain(storeId);
    }
  });

  it("purges FTS, salience, and redacts messages with per-store receipts", async () => {
    const database = freshDb();
    const messageId = Number(
      database
        .prepare(
          `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
           VALUES (?, ?, ?, ?, ?, ?, 'internal', 'indexable')`
        )
        .run("sess-erase", "proj", "agent", "user", "secret content to erase", "2026-01-01T00:00:00Z")
        .lastInsertRowid
    );
    // FTS row is created by messages_ai trigger (do not manual-insert into external-content FTS).
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM messages_fts WHERE rowid = ?").get(messageId) as { count: number })
        .count
    ).toBe(1);
    database
      .prepare(`INSERT INTO memory_salience(message_id, tier, salience_score, last_decay_at) VALUES (?, 'mid', 1.0, ?)`)
      .run(messageId, "2026-01-01T00:00:00Z");

    const identity = buildCanonicalIdentity("secret content to erase", "message", "ingress/test", "message", {
      tenantId: "default-tenant",
    });
    // Run FTS before message so we can assert an explicit purge receipt; message
    // sealing also removes indexable FTS rows via triggers afterward.
    identity.derivatives = [
      { storeId: "fts", sourceHash: identity.canonicalHash, provenance: "test", metadata: { message_id: messageId } },
      { storeId: "salience", sourceHash: identity.canonicalHash, provenance: "test", metadata: { message_id: messageId } },
      { storeId: "message", sourceHash: identity.canonicalHash, provenance: "test", metadata: { message_id: messageId } },
    ];

    const report = await coordinateErasure(database, identity, {
      tenantId: "default-tenant",
      actorId: "tester",
      scope: { tenantId: "default-tenant" },
    });

    expect(["purged", "tombstoned", "zero_match"]).toContain(
      report.storeOutcomes.find((o) => o.storeId === "fts")?.status
    );
    expect(report.storeOutcomes.find((o) => o.storeId === "salience")?.status).toBe("purged");
    expect(report.storeOutcomes.find((o) => o.storeId === "message")?.status).toBe("tombstoned");

    const msg = database.prepare("SELECT content, policy FROM messages WHERE id = ?").get(messageId) as {
      content: string;
      policy: string;
    };
    expect(msg.content).toBe("[erased]");
    expect(msg.policy).toBe("sealed");
    expect(
      (database.prepare("SELECT COUNT(*) AS count FROM memory_salience WHERE message_id = ?").get(messageId) as { count: number })
        .count
    ).toBe(0);
    // External-content FTS: verify via MATCH, not rowid COUNT against the content table.
    expect(
      database.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all("secret")
    ).toHaveLength(0);

    const reports = database.prepare("SELECT status, store_outcomes_json FROM memory_erasure_reports WHERE id = ?").get(
      report.erasureId
    ) as { status: string; store_outcomes_json: string };
    expect(reports).toBeTruthy();
    expect(JSON.parse(reports.store_outcomes_json).length).toBeGreaterThan(0);
  });

  it("tombstones platform + candidates and invalidates cache tags", async () => {
    const database = freshDb();
    await responseCache.getOrSet("ns", "k1", 60_000, () => ({ ok: true }), ["canon-tag"]);

    database
      .prepare(
        `INSERT INTO platform_message_memory
         (id, dedupe_key, provider, workspace_id, channel_id, thread_id, provider_message_id,
          author_id, author_name, content, content_hash, message_timestamp, permalink, message_row_id,
          metadata, created_at, updated_at)
         VALUES (?, ?, 'slack', 'w', 'c', NULL, 'pm1', 'a', 'A', 'platform secret', ?, '2026-01-01T00:00:00Z',
                 NULL, NULL, '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
      )
      .run("pmm-1", "dedupe-1", "hash-platform-1");

    database
      .prepare(
        `INSERT INTO agent_session_captures
         (id, tenant_id, source_agent_id, runtime, session_id, capture_hash, captured_at)
         VALUES (?, 'default-tenant', 'agent', 'test', 'sess', 'ch', '2026-01-01T00:00:00Z')`
      )
      .run("cap-1");

    database
      .prepare(
        `INSERT INTO agent_memory_candidates
         (id, tenant_id, capture_id, agent_id, memory_type, content, content_hash, status, metadata_json, created_at)
         VALUES (?, 'default-tenant', 'cap-1', 'agent', 'lesson', 'candidate secret', 'hash-platform-1', 'candidate', '{}', '2026-01-01T00:00:00Z')`
      )
      .run("cand-1");

    const identity = buildCanonicalIdentity("platform secret", "platform", "ingress", "platform", {
      tenantId: "default-tenant",
    });
    // Force match via content_hash equality by rewriting identity hash for platform lookup.
    (identity as { canonicalHash: string }).canonicalHash = "hash-platform-1";
    identity.derivatives.push(
      { storeId: "candidates", sourceHash: "hash-platform-1", provenance: "test", metadata: { candidate_id: "cand-1" } },
      { storeId: "cache", sourceHash: "hash-platform-1", provenance: "test" }
    );

    // Tag cache with canonical id for invalidation.
    await responseCache.getOrSet("ns", "k2", 60_000, () => ({ v: 2 }), [identity.id, `canonical:${identity.id}`]);

    const report = await coordinateErasure(database, identity, {
      tenantId: "default-tenant",
      actorId: "tester",
      scope: { tenantId: "default-tenant" },
    });

    expect(report.storeOutcomes.find((o) => o.storeId === "platform")?.status).toBe("tombstoned");
    expect(report.storeOutcomes.find((o) => o.storeId === "candidates")?.status).toBe("tombstoned");
    expect(report.storeOutcomes.find((o) => o.storeId === "cache")?.status).toBe("purged");

    const platform = database.prepare("SELECT content FROM platform_message_memory WHERE id = ?").get("pmm-1") as {
      content: string;
    };
    expect(platform.content).toBe("[erased]");
    const candidate = database.prepare("SELECT content, status FROM agent_memory_candidates WHERE id = ?").get("cand-1") as {
      content: string;
      status: string;
    };
    expect(candidate.content).toBe("[erased]");
    expect(candidate.status).toBe("rejected");
  });

  it("reports graph unavailable when Neo4j is not configured (honest degrade)", async () => {
    const database = freshDb();
    const prev = process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_PASSWORD;
    try {
      const identity = buildCanonicalIdentity("g", "graph", "ingress", "graph", { tenantId: "default-tenant" });
      const report = await coordinateErasure(database, identity, {
        tenantId: "default-tenant",
        actorId: "tester",
        scope: { tenantId: "default-tenant" },
      });
      const graph = report.storeOutcomes.find((o) => o.storeId === "graph");
      expect(graph?.status).toBe("unavailable");
      expect(graph?.reason).toMatch(/neo4j_not_configured/);
      expect(report.status).toBe("incomplete");
    } finally {
      if (prev === undefined) delete process.env.NEO4J_PASSWORD;
      else process.env.NEO4J_PASSWORD = prev;
    }
  });
});
