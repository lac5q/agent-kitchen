// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { recallByKeyword } from "@/lib/db-ingest";
import {
  authorizeMemoryUse,
  filterAuthorizedMemoryItems,
  filterAuthorizedMessageRows,
} from "@/lib/memory/policy-gate";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

describe("MEMSEC-08 negative fixture regression suite", () => {
  const restrictedCases = [
    ["legal", "legal settlement draft privileged clause", "legal", "privileged"],
    ["finance", "finance account routing payment detail", "finance", "payment"],
    ["hr", "hr salary review confidential note", "hr", "personal"],
    ["credential", "api token secret credential value", "engineering", "credential"],
    ["personal", "personal family medical note", "personal", "health"],
    ["public-promotion", "draft public announcement pending approval", "engineering", null],
  ] as const;

  it.each(restrictedCases)(
    "denies %s restricted memory to recall and dispatch before projection",
    (_name, content, domain, sensitivity) => {
      const decision = authorizeMemoryUse({
        actor: { id: "agent:test", role: "agent" },
        purpose: "dispatch",
        label: {
          visibility: "private",
          domain,
          sensitivity,
          policy: "requires_human_review",
        },
      });

      expect(decision.decision).toBe("review-required");

      const item = {
        id: `item-${_name}`,
        memory: content,
        metadata: {
          visibility: "private",
          domain,
          sensitivity,
          policy: "requires_human_review",
        },
      };
      const allowed = filterAuthorizedMemoryItems(
        db,
        [item],
        { id: "agent:test", role: "agent" },
        "multi-search",
        (candidate) => candidate.metadata
      );
      expect(allowed).toHaveLength(0);
    }
  );

  it("keeps restricted rows out of FTS recall and allows only approved indexable rows", () => {
    const restrictedNeedle = "restrictedneedle";
    const approvedNeedle = "approvedneedle";
    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, domain, sensitivity, policy)
       VALUES
       ('s-restricted', 'memroos', 'codex', 'user', ?, '2026-05-24T00:00:00Z', 'private', 'legal', 'privileged', 'requires_human_review'),
       ('s-approved', 'memroos', 'codex', 'user', ?, '2026-05-24T00:00:00Z', 'public_approved', 'engineering', NULL, 'indexable')`
    ).run(`do not leak ${restrictedNeedle}`, `safe to recall ${approvedNeedle}`);

    expect(recallByKeyword(db, restrictedNeedle)).toHaveLength(0);
    expect(recallByKeyword(db, approvedNeedle)).toHaveLength(1);
  });

  it("filters already-fetched message rows before context pack or export use", () => {
    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES
       ('s-private', 'memroos', 'codex', 'user', 'private context', '2026-05-24T00:00:00Z', 'private', 'sealed'),
       ('s-internal', 'memroos', 'codex', 'user', 'agent visible context', '2026-05-24T00:00:00Z', 'internal', 'agent_visible')`
    ).run();
    const rows = db.prepare("SELECT id FROM messages ORDER BY id ASC").all() as Array<{ id: number }>;

    const allowed = filterAuthorizedMessageRows(
      db,
      rows,
      { id: "agent:test", role: "agent" },
      "context-pack"
    );

    expect(allowed).toHaveLength(1);
    expect(allowed[0].id).toBe(rows[1].id);
  });

  it("denies other users private legal/finance agent_visible while allowing owner and admin", () => {
    const ownedLegal = {
      visibility: "private" as const,
      domain: "legal" as const,
      sensitivity: "privileged" as const,
      policy: "agent_visible" as const,
      ownerUserId: "user:owner",
    };
    const ownedFinance = {
      visibility: "private" as const,
      domain: "finance" as const,
      sensitivity: "payment" as const,
      policy: "indexable" as const,
      ownerUserId: "user:owner",
    };

    expect(
      authorizeMemoryUse({
        actor: { id: "user:other", role: "operator" },
        purpose: "recall",
        label: ownedLegal,
      }).decision
    ).toBe("deny");

    expect(
      authorizeMemoryUse({
        actor: { id: "user:owner", role: "operator" },
        purpose: "recall",
        label: ownedLegal,
      }).decision
    ).toBe("allow");

    expect(
      authorizeMemoryUse({
        actor: { id: "user:admin", role: "admin" },
        purpose: "recall",
        label: ownedFinance,
      }).decision
    ).toBe("allow");

    expect(
      authorizeMemoryUse({
        actor: { id: "agent:worker", role: "agent" },
        purpose: "dispatch",
        label: ownedFinance,
      }).decision
    ).toBe("deny");
  });
});
