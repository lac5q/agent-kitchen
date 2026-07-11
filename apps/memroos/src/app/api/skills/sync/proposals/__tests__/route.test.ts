// @vitest-environment node
/**
 * Phase 149 (continued) / SKILLTRUST-04 — API route tests for
 * /api/skills/sync/proposals and the proposal-id approve / reject
 * routes.
 *
 * Covers:
 *   - GET /api/skills/sync/proposals returns pending proposals with
 *     safe schema (no raw body, IDs/hashes only).
 *   - POST /api/skills/sync/proposals/:proposalId/approve requires
 *     operator auth, re-verifies source content, applies allowlisted
 *     projections atomically, and writes audit.
 *   - POST /api/skills/sync/proposals/:proposalId/reject requires
 *     operator + reason.
 *   - Stale concurrent updates (mismatched expected_updated_at)
 *     return 409.
 *   - Source hash mismatch between scan and approve returns 409.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-sync-proposals-route-${crypto.randomUUID()}`
);

beforeEach(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(
    TMP_ROOT,
    `db-${crypto.randomUUID()}.db`
  );
  vi.resetModules();
});

afterEach(async () => {
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  delete process.env["MEMROOS_OPERATOR_API_KEY"];
  try {
    const dbModule = await import("@/lib/db");
    dbModule.closeDb();
  } catch {
    /* ignore */
  }
  vi.resetModules();
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

async function loadDb() {
  const { getDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return db;
}

async function loadRoute() {
  return await import("../route");
}

function insertSkillRow(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    content_hash?: string;
    dispatch_status?: string;
    completeness_pct?: number;
  } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?
      )`
    )
    .run(
      overrides.name ?? "proposal-skill",
      "Test",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      "## Preconditions\nnone",
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      overrides.content_hash ?? "0".repeat(64),
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

function makePost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeGet(url = "https://example.com/api/skills/sync/proposals"): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/skills/sync/proposals", () => {
  it("200 — returns pending proposals without operator auth", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const db = await loadDb();
    insertSkillRow(db, {
      name: "test-skill",
      source_harness: "claude",
      content_hash: "0".repeat(64),
    });

    // Seed a pending proposal via createImportProposal.
    const skillSync = await import("@/lib/skills/skill-sync");
    skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "test-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "new body",
        content_hash: "1".repeat(64),
        file_path: "/tmp/skills/claude/test-skill.md",
      },
      proposed_by: "scanner",
      diff_summary: "version bump",
      source_root: "/tmp/skills/claude",
    });

    const route = await loadRoute();
    const res = await route.GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.length).toBe(1);
    const item = json.items[0];
    expect(item.proposal_id).toBeTruthy();
    expect(item.skill_name).toBe("test-skill");
    expect(item.source_harness).toBe("claude");
    expect(item.status).toBe("pending");
    expect(item.base_hash).toBe("0".repeat(64));
    expect(item.candidate_hash).toBe("1".repeat(64));
    expect(item.summary).toBe("version bump");
    // The response must NOT echo the raw_body.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("new body");
  });

  it("400 — invalid status filter", async () => {
    const route = await loadRoute();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/sync/proposals?status=bogus")
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/skills/sync/proposals/:proposalId/approve", () => {
  it("401 without operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    await loadDb();
    const route = await import("../[proposalId]/approve/route");
    const res = await route.POST(
      makePost("https://example.com/api/skills/sync/proposals/x/approve", {
        operator: "alice",
      })
    );
    expect(res.status).toBe(401);
  });

  it("200 — approves a pending proposal with allowlisted projections", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertSkillRow(db, {
      name: "approve-projection",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });

    const skillSync = await import("@/lib/skills/skill-sync");
    const result = skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "approve-projection",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "## Preconditions\n## Allowed Tools\n## Verification Checks\n## Rollback\n## Evidence Examples",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
      diff_summary: "v2",
    });
    const proposalId = result.proposal.pending_proposal_id;
    expect(proposalId).toBeTruthy();

    const route = await import("../[proposalId]/approve/route");
    const res = await route.POST(
      makePost(
        `https://example.com/api/skills/sync/proposals/${proposalId}/approve`,
        { operator: "alice", reason: "ok" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.status).toBe("approved");
    expect(json.proposal.decided_by).toBe("alice");
    expect(json.proposal.registry_updated).toBe(true);

    // Registry row was updated with the allowlisted fields.
    const reg = db
      .prepare(
        `SELECT content_hash, version, dispatch_status FROM skill_registry
           WHERE name = 'approve-projection' AND source_harness = 'claude'`
      )
      .get() as { content_hash: string; version: string; dispatch_status: string };
    expect(reg.content_hash).toBe("1".repeat(64));
    expect(reg.version).toBe("2.0.0");
    expect(reg.dispatch_status).toBe("quarantined");

    // Audit entry exists.
    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.sync.proposal.approved'
             AND entity_id = ?`
      )
      .get(proposalId!) as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("409 — source hash mismatch between scan and approve", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();

    // Create a real SKILL.md file under a harness root so the
    // approval path can re-read it.
    const harnessRoot = path.join(TMP_ROOT, "harness-claude");
    fs.mkdirSync(harnessRoot, { recursive: true });
    const skillFile = path.join(harnessRoot, "drift-skill.md");
    fs.writeFileSync(skillFile, "original content", "utf8");
    const originalHash = crypto
      .createHash("sha256")
      .update("original content", "utf8")
      .digest("hex");
    insertSkillRow(db, {
      name: "drift-skill",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });

    const skillSync = await import("@/lib/skills/skill-sync");
    const result = skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "drift-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "original content",
        content_hash: originalHash,
        file_path: skillFile,
      },
      proposed_by: "scanner",
      diff_summary: "drift",
      source_root: harnessRoot,
    });
    const proposalId = result.proposal.pending_proposal_id;

    // Mutate the source file so the re-verification fails.
    fs.writeFileSync(skillFile, "tampered content", "utf8");

    const route = await import("../[proposalId]/approve/route");
    const res = await route.POST(
      makePost(
        `https://example.com/api/skills/sync/proposals/${proposalId}/approve`,
        { operator: "alice" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId }) }
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/Source hash mismatch/i);
  });

  it("409 — stale concurrent update via expected_updated_at mismatch", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertSkillRow(db, {
      name: "stale-skill",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const skillSync = await import("@/lib/skills/skill-sync");
    const result = skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "stale-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "body",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    const proposalId = result.proposal.pending_proposal_id;
    const updatedAt = result.proposal.updated_at;

    const route = await import("../[proposalId]/approve/route");
    const res = await route.POST(
      makePost(
        `https://example.com/api/skills/sync/proposals/${proposalId}/approve`,
        {
          operator: "alice",
          expected_updated_at: "2000-01-01T00:00:00.000Z",
        },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId }) }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Stale concurrent/i);
    void updatedAt;
  });

  it("404 — unknown proposal id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await import("../[proposalId]/approve/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/proposals/does-not-exist/approve",
        { operator: "alice" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId: "does-not-exist" }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/skills/sync/proposals/:proposalId/reject", () => {
  it("200 — rejects a pending proposal with operator + reason", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const db = await loadDb();
    insertSkillRow(db, {
      name: "reject-skill",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const skillSync = await import("@/lib/skills/skill-sync");
    const result = skillSync.createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "reject-skill",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "body",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    const proposalId = result.proposal.pending_proposal_id;

    const route = await import("../[proposalId]/reject/route");
    const res = await route.POST(
      makePost(
        `https://example.com/api/skills/sync/proposals/${proposalId}/reject`,
        { operator: "bob", reason: "spam" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.status).toBe("rejected");
    expect(json.proposal.reason).toBe("spam");

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.sync.proposal.rejected'`
      )
      .get() as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("400 — missing reason", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadDb();
    const route = await import("../[proposalId]/reject/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/proposals/x/reject",
        { operator: "bob" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ proposalId: "x" }) }
    );
    expect(res.status).toBe(400);
  });

  it("401 — no operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    await loadDb();
    const route = await import("../[proposalId]/reject/route");
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/sync/proposals/x/reject",
        { operator: "bob", reason: "spam" }
      ),
      { params: Promise.resolve({ proposalId: "x" }) }
    );
    expect(res.status).toBe(401);
  });
});
