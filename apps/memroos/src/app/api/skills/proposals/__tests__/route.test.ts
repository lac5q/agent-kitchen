// @vitest-environment node
/**
 * Phase 149 / SKILLTRUST-04 — API route tests for /api/skills/proposals.
 *
 * Covers:
 *   - POST creates a pending proposal without operator auth -> 401
 *   - POST with wrong operator key -> 403
 *   - POST with right operator key -> 200, proposal returned, registry untouched
 *   - POST same proposal twice -> dedupe (second call reports created=false)
 *   - GET list endpoint works without auth (read-only)
 *   - POST body validation: missing source_harness / skill_name / hash -> 400
 *
 * Approval / rejection have their own colocated tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-proposals-route-${crypto.randomUUID()}`
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

async function loadRouteAndDb() {
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const route = await import("../route");
  const db = getDb();
  initSchema(db);
  return { route, db, closeDb };
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
      overrides.name ?? "route-skill",
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

function makePost(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/skills/proposals", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeGet(url = "https://example.com/api/skills/proposals"): Request {
  return new Request(url, { method: "GET" });
}

describe("POST /api/skills/proposals", () => {
  it("401 when no operator key configured", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost({
        source_harness: "claude",
        skill_name: "skill",
        detected_content_hash: "a".repeat(64),
        proposed_by: "scanner",
      })
    );
    expect(res.status).toBe(401);
  });

  it("403 when key is configured but mismatched", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "skill",
          detected_content_hash: "a".repeat(64),
          proposed_by: "scanner",
        },
        { authorization: "Bearer wrong-key" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("200 — creates a pending proposal and leaves the registry untouched", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    const skillId = insertSkillRow(db, {
      name: "detection-target",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const before = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(skillId) as { dispatch_status: string };

    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "detection-target",
          detected_content_hash: "1".repeat(64),
          proposed_by: "scanner",
          diff_summary: "hash changed",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.created).toBe(true);
    expect(json.unchanged).toBe(false);
    expect(json.proposal.status).toBe("pending");
    expect(json.proposal.affected_skill_id).toBe(skillId);

    // Registry untouched.
    const after = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(skillId) as { dispatch_status: string };
    expect(after.dispatch_status).toBe(before.dispatch_status);
  });

  it("200 — dedupe on identical-hash re-scan (created=false)", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const body = {
      source_harness: "claude",
      skill_name: "dedupe-skill",
      detected_content_hash: "5".repeat(64),
      proposed_by: "scanner",
    };
    const res1 = await route.POST(
      makePost(body, { authorization: "Bearer right-key" })
    );
    const res2 = await route.POST(
      makePost(body, { authorization: "Bearer right-key" })
    );
    const j1 = await res1.json();
    const j2 = await res2.json();
    expect(j1.created).toBe(true);
    expect(j2.created).toBe(false);
    expect(j2.proposal.id).toBe(j1.proposal.id);
  });

  it("400 — missing source_harness", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          skill_name: "x",
          detected_content_hash: "a".repeat(64),
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — missing skill_name", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          detected_content_hash: "a".repeat(64),
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — neither hash nor body supplied", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "x",
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — malformed detected_content_hash", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "x",
          detected_content_hash: "tooshort",
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — diff_payload must be an object", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "x",
          detected_content_hash: "a".repeat(64),
          proposed_by: "scanner",
          diff_payload: "not-an-object",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("no raw skill body is leaked back in the response", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const secret = "AKIAIOSFODNN7EXAMPLE"; // looks like a secret
    const bodyHash = crypto
      .createHash("sha256")
      .update(secret, "utf8")
      .digest("hex");
    const res = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "secret-skill",
          detected_content_body: secret,
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Serialized response must not echo the secret body or the secret itself.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(secret);
    // The detected_content_hash IS in the response (it's the safe identifier).
    expect(json.proposal.detected_content_hash).toBe(bodyHash);
  });
});

describe("GET /api/skills/proposals (read-only)", () => {
  it("200 without operator auth", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { route } = await loadRouteAndDb();
    const res = await route.GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.items)).toBe(true);
  });

  it("400 — invalid status filter", async () => {
    const { route } = await loadRouteAndDb();
    const res = await route.GET(
      makeGet("https://example.com/api/skills/proposals?status=bogus")
    );
    expect(res.status).toBe(400);
  });

  it("filters by status / source_harness", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    // seed two pending proposals
    for (const harness of ["claude", "codex"]) {
      await route.POST(
        makePost(
          {
            source_harness: harness,
            skill_name: `${harness}-skill`,
            detected_content_hash: crypto
              .createHash("sha256")
              .update(harness)
              .digest("hex"),
            proposed_by: "scanner",
          },
          { authorization: "Bearer right-key" }
        )
      );
    }
    const claudeRes = await route.GET(
      makeGet("https://example.com/api/skills/proposals?source_harness=claude")
    );
    const claudeJson = await claudeRes.json();
    expect(claudeJson.items.every((p: { source_harness: string }) => p.source_harness === "claude")).toBe(true);

    const pendingRes = await route.GET(
      makeGet("https://example.com/api/skills/proposals?status=pending")
    );
    const pendingJson = await pendingRes.json();
    expect(pendingJson.items.length).toBeGreaterThan(0);
    expect(pendingJson.items.every((p: { status: string }) => p.status === "pending")).toBe(true);
  });
});

describe("POST /api/skills/proposals/[id]/approve", () => {
  it("401 without operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    const db = getDb();
    initSchema(db);
    const route = await import("../[id]/approve/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operator: "alice" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("403 with wrong key", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    const db = getDb();
    initSchema(db);
    const route = await import("../[id]/approve/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong-key",
        },
        body: JSON.stringify({ operator: "alice" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("200 — approves a pending proposal", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    const create = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "approve-route",
          detected_content_hash: "9".repeat(64),
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    const createdJson = await create.json();
    const proposalId = createdJson.proposal.id;

    const approveRoute = await import("../[id]/approve/route");
    const res = await approveRoute.POST(
      new Request(`https://example.com/api/skills/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ operator: "alice", reason: "looks good" }),
      }),
      { params: Promise.resolve({ id: proposalId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.status).toBe("approved");
    expect(json.proposal.decided_by).toBe("alice");

    // audit_entries must contain a skill.proposal.approved row.
    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.proposal.approved'
             AND entity_id = ?`
      )
      .get(proposalId) as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("404 — unknown proposal id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await import("../[id]/approve/route");
    const res = await route.POST(
      new Request(
        "https://example.com/api/skills/proposals/does-not-exist/approve",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer right-key",
          },
          body: JSON.stringify({ operator: "alice" }),
        }
      ),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(res.status).toBe(404);
  });

  it("400 — missing operator in body", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await import("../[id]/approve/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/approve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/skills/proposals/[id]/reject", () => {
  it("200 — rejects with operator + reason", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    const create = await route.POST(
      makePost(
        {
          source_harness: "claude",
          skill_name: "reject-route",
          detected_content_hash: "7".repeat(64),
          proposed_by: "scanner",
        },
        { authorization: "Bearer right-key" }
      )
    );
    const proposalId = (await create.json()).proposal.id;

    const rejectRoute = await import("../[id]/reject/route");
    const res = await rejectRoute.POST(
      new Request(`https://example.com/api/skills/proposals/${proposalId}/reject`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ operator: "bob", reason: "spammy" }),
      }),
      { params: Promise.resolve({ id: proposalId }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposal.status).toBe("rejected");
    expect(json.proposal.decision_reason).toBe("spammy");

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.proposal.rejected'
             AND entity_id = ?`
      )
      .get(proposalId) as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("400 — missing reason", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await import("../[id]/reject/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ operator: "bob" }),
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    expect(res.status).toBe(400);
  });

  it("401 — no operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await import("../[id]/reject/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operator: "bob", reason: "x" }),
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    expect(res.status).toBe(401);
  });

  it("400 for invalid JSON and missing operator", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const route = await import("../[id]/reject/route");

    const invalidJson = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: "{",
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    expect(invalidJson.status).toBe(400);

    const missingOperator = await route.POST(
      new Request("https://example.com/api/skills/proposals/x/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ reason: "spam" }),
      }),
      { params: Promise.resolve({ id: "x" }) }
    );
    expect(missingOperator.status).toBe(400);
  });

  it("404 when the proposal does not exist", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    await loadRouteAndDb();
    const route = await import("../[id]/reject/route");
    const res = await route.POST(
      new Request("https://example.com/api/skills/proposals/missing/reject", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: JSON.stringify({ operator: "bob", reason: "missing" }),
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });
});
