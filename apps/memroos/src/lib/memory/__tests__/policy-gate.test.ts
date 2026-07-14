// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  authorizeMemoryUse,
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  filterAuthorizedMessageRows,
} from "../policy-gate";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

describe("memory policy gate", () => {
  it("denies default private sealed labels", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "agent:test", role: "agent" },
      purpose: "recall",
      label: { visibility: "private", policy: "sealed" },
    });

    expect(decision).toMatchObject({ decision: "deny", reason: "sealed_content" });
  });

  it("allows public approved indexable labels", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:reviewer", role: "reviewer" },
      purpose: "recall",
      label: { visibility: "public_approved", policy: "indexable" },
    });

    expect(decision.decision).toBe("allow");
  });

  it("routes human-review labels to review-required", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:operator", role: "operator" },
      purpose: "export",
      label: { visibility: "private", policy: "requires_human_review" },
    });

    expect(decision.decision).toBe("review-required");
  });

  it("filters message rows and audits denied recall decisions", () => {
    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES
       ('private-session', 'memroos', 'codex', 'user', 'private needle', '2026-05-24T00:00:00Z', 'private', 'sealed'),
       ('public-session', 'memroos', 'codex', 'user', 'public needle', '2026-05-24T00:01:00Z', 'public_approved', 'indexable')`
    ).run();

    const rows = db.prepare("SELECT id FROM messages ORDER BY id").all() as Array<{ id: number }>;
    const filtered = filterAuthorizedMessageRows(
      db,
      rows,
      { id: "agent:test", role: "agent" },
      "recall"
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(rows[1].id);

    const audit = db
      .prepare("SELECT action, target, detail FROM audit_log WHERE action = 'memory_policy_decision'")
      .get() as { action: string; target: string; detail: string };
    expect(audit.target).toBe(`message:${rows[0].id}`);
    expect(audit.detail).toContain("sealed_content");
  });

  it("extracts labels from nested external memory metadata", () => {
    const label = extractMemoryLabelSnapshot({
      id: "mem0-1",
      memory: "labeled external memory",
      metadata: {
        label: {
          visibility: "internal",
          policy: "agent_visible",
          domain: "engineering",
        },
      },
    });

    expect(label).toEqual({
      visibility: "internal",
      policy: "agent_visible",
      domain: "engineering",
    });
  });

  it("fails closed for unlabeled external memory items and audits the denial", () => {
    const items = [
      { id: "unlabeled", memory: "should not leave the tier" },
      {
        id: "labeled",
        memory: "allowed for agents",
        metadata: { visibility: "internal", policy: "agent_visible" },
      },
    ];

    const filtered = filterAuthorizedMemoryItems(
      db,
      items,
      { id: "agent:test", role: "agent" },
      "multi-search",
      extractMemoryLabelSnapshot,
      (item) => `external:${item.id}`
    );

    expect(filtered).toEqual([items[1]]);
    const audit = db
      .prepare("SELECT target, detail FROM audit_log WHERE action = 'memory_policy_decision'")
      .get() as { target: string; detail: string };
    expect(audit.target).toBe("external:unlabeled");
    expect(audit.detail).toContain("sealed_content");
  });

  it("allows owner for private agent_visible when actor.id matches ownerUserId", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:owner", role: "operator" },
      purpose: "recall",
      label: {
        visibility: "private",
        policy: "agent_visible",
        domain: "legal",
        ownerUserId: "user:owner",
      },
    });
    expect(decision).toMatchObject({ decision: "allow", reason: "owner_or_admin_private" });
  });

  it("allows admin for private indexable even when not the owner", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:admin", role: "admin" },
      purpose: "recall",
      label: {
        visibility: "private",
        policy: "indexable",
        domain: "finance",
        ownerUserId: "user:owner",
      },
    });
    expect(decision).toMatchObject({ decision: "allow", reason: "owner_or_admin_private" });
  });

  it("denies other users for private agent_visible owned by someone else", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:other", role: "operator" },
      purpose: "recall",
      label: {
        visibility: "private",
        policy: "agent_visible",
        ownerUserId: "user:owner",
      },
    });
    expect(decision).toMatchObject({ decision: "deny", reason: "private_content" });
  });

  it("denies agents for private agent_visible even when id equals ownerUserId", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:owner", role: "agent" },
      purpose: "dispatch",
      label: {
        visibility: "private",
        policy: "agent_visible",
        ownerUserId: "user:owner",
      },
    });
    expect(decision).toMatchObject({ decision: "deny", reason: "private_content" });
  });

  it("still denies owner when private content remains sealed", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:owner", role: "operator" },
      purpose: "recall",
      label: {
        visibility: "private",
        policy: "sealed",
        ownerUserId: "user:owner",
      },
    });
    expect(decision).toMatchObject({ decision: "deny", reason: "sealed_content" });
  });

  it("extracts ownerUserId from nested metadata owner_user_id", () => {
    const label = extractMemoryLabelSnapshot({
      id: "mem0-owned",
      memory: "owned memory",
      metadata: {
        visibility: "private",
        policy: "agent_visible",
        owner_user_id: "user:owner",
      },
    });
    expect(label).toMatchObject({
      visibility: "private",
      policy: "agent_visible",
      ownerUserId: "user:owner",
    });
  });

  it("merges nested owner_user_id when top-level label omits owner", () => {
    const label = extractMemoryLabelSnapshot({
      visibility: "private",
      policy: "agent_visible",
      metadata: { owner_user_id: "user:owner" },
    });
    expect(label).toMatchObject({
      visibility: "private",
      policy: "agent_visible",
      ownerUserId: "user:owner",
    });
  });

  it("denies anonymous and system even when id matches ownerUserId", () => {
    const label = {
      visibility: "private" as const,
      policy: "agent_visible" as const,
      ownerUserId: "user:owner",
    };
    expect(
      authorizeMemoryUse({
        actor: { id: "user:owner", role: "anonymous" },
        purpose: "recall",
        label,
      }).decision
    ).toBe("deny");
    expect(
      authorizeMemoryUse({
        actor: { id: "user:owner", role: "system" },
        purpose: "recall",
        label,
      }).decision
    ).toBe("deny");
  });

  it("allows reviewer owner and keeps ownerUserId off decision.label", () => {
    const decision = authorizeMemoryUse({
      actor: { id: "user:owner", role: "reviewer" },
      purpose: "recall",
      label: {
        visibility: "private",
        policy: "agent_visible",
        ownerUserId: "user:owner",
      },
    });
    expect(decision.decision).toBe("allow");
    expect(decision.label).toEqual({
      visibility: "private",
      domain: null,
      sensitivity: null,
      policy: "agent_visible",
    });
    expect("ownerUserId" in decision.label).toBe(false);
  });
});
