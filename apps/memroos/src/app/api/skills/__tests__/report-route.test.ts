// @vitest-environment node
/**
 * Phase 149 SKILLTRUST-01 (continued) tests:
 *   VAL-SKILL-020: agent reports are observations, not trust grants
 *   VAL-SKILL-021: agent capability names cannot bypass skill governance
 *
 * Covers:
 *   - Reports require valid non-revoked agent key
 *   - Trust-grant actions (enable/trust/pin/approve/etc.) are rejected
 *   - Unknown skill/version reports are surfaced as 'unresolved'
 *   - Reports cannot create, enable, trust, pin, or approve a registry skill
 *   - Agent capability names do not create registry skills
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `skills-report-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent/registry");
  const route = await import("../report/route");
  const dbModule = await import("@/lib/db");
  return { ...registry, ...route, closeDb: dbModule.closeDb, getDb: dbModule.getDb };
}

function insertSkill(
  db: import("better-sqlite3").Database,
  overrides: Partial<{
    name: string;
    source_harness: string;
    dispatch_status: string;
    completeness_pct: number;
  }> = {}
) {
  db.prepare(`
    INSERT OR REPLACE INTO skill_registry
      (name, source_harness, dispatch_status, completeness_pct, raw_body, missing_fields_json, imported_by, imported_at)
    VALUES (@name, @source_harness, @dispatch_status, @completeness_pct, '', '[]', 'operator', @imported_at)
  `).run({
    name: overrides.name ?? "test-skill",
    source_harness: overrides.source_harness ?? "claude",
    dispatch_status: overrides.dispatch_status ?? "enabled",
    completeness_pct: overrides.completeness_pct ?? 100,
    imported_at: new Date().toISOString(),
  });
}

beforeEach(() => {
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterEach(async () => {
  const { closeDb } = await loadRoute();
  closeDb();
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  delete process.env.SQLITE_DB_PATH;
});

// ---------------------------------------------------------------------------
// VAL-SKILL-020: agent reports are observations, not trust grants
// ---------------------------------------------------------------------------

describe("VAL-SKILL-020 — agent reports are observations, not trust grants", () => {
  it("rejects missing, invalid, and body-only agent identity", async () => {
    const { POST, registerAgent } = await loadRoute();
    registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const body = JSON.stringify({ agentId: "skill-agent", skillId: "test", action: "used" });
    expect((await POST(new Request("http://localhost/api/skills/report", { method: "POST", body }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/skills/report", {
            method: "POST",
            headers: { authorization: "Bearer nope" },
            body,
          })
        )
      ).status
    ).toBe(401);
  });

  it("records a valid authenticated skill report as observation (resolved identity)", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    // Seed a registry row so the report resolves
    insertSkill(getDb(), { name: "resolved-skill", source_harness: "claude" });

    const res = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: "resolved-skill", action: "used", metadata: { ok: true } }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.observation.status).toBe("resolved");
    expect(body.observation.resolved_identity.name).toBe("resolved-skill");
    expect(body.observation.resolved_identity.source_harness).toBe("claude");
    expect(body.observation.action).toBe("used");

    // The agent_skill_reports row was written with enriched metadata.
    const rows = getDb().prepare("SELECT agent_id, skill_id, action, metadata FROM agent_skill_reports").all() as Array<{
      agent_id: string;
      skill_id: string;
      action: string;
      metadata: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].agent_id).toBe("skill-agent");
    expect(rows[0].skill_id).toBe("resolved-skill");
    expect(rows[0].action).toBe("used");
    const meta = JSON.parse(rows[0].metadata);
    expect(meta.agent_id).toBe("skill-agent");
    expect(meta.resolved_skill_id).toBeGreaterThan(0);
    expect(meta.observation_status).toBe("resolved");
  });

  it("surfaces unknown skill as unresolved observation without creating registry row", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const before = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;
    const res = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: "ghost-skill", action: "used" }),
      })
    );
    const after = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.observation.status).toBe("unresolved");
    expect(body.observation.resolved_identity).toBeNull();
    expect(after).toBe(before); // No new registry row created.
  });

  it("rejects trust-grant actions (enable, trust, pin, approve)", async () => {
    const { POST, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const trustActions = ["enable", "trust", "approve", "pin", "activate", "certify", "deploy", "register", "create", "promote", "import"];
    for (const action of trustActions) {
      const res = await POST(
        new Request("http://localhost/api/skills/report", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ skillId: "any-skill", action }),
        })
      );
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.code).toBe("TRUST_GRANT_REJECTED");
      expect(body.error).toMatch(new RegExp(action, "i"));
    }
  });

  it("rejects unknown action verbs (not in observation vocabulary)", async () => {
    const { POST, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const res = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: "x", action: "do-something-unknown" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ACTION");
  });

  it("rejects reports without skillId or action", async () => {
    const { POST, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const r1 = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ action: "used" }),
      })
    );
    expect(r1.status).toBe(400);
    const r2 = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: "x" }),
      })
    );
    expect(r2.status).toBe(400);
  });

  it("resolves skill by numeric registry id", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    insertSkill(getDb(), { name: "by-id", source_harness: "claude" });
    const id = (getDb().prepare("SELECT id FROM skill_registry WHERE name = ?").get("by-id") as { id: number }).id;

    const res = await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: String(id), action: "used" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.observation.status).toBe("resolved");
    expect(body.observation.resolved_identity.id).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// VAL-SKILL-021: agent capability names cannot bypass skill governance
// ---------------------------------------------------------------------------

describe("VAL-SKILL-021 — agent capability names cannot bypass skill governance", () => {
  it("registering an agent with a capability named like a skill does NOT create a registry row", async () => {
    const { registerAgent, getDb } = await loadRoute();
    const before = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;

    registerAgent({
      id: "capability-agent",
      name: "Capability Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      capabilities: [
        {
          id: "cap-code-review",
          name: "code-review",
          description: "agent declares this skill",
          tags: ["skill-like"],
        },
      ],
      issueApiKey: true,
    });

    const after = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;
    expect(after).toBe(before);

    // The capability lives in agent_capabilities, NOT skill_registry.
    const caps = getDb().prepare("SELECT name FROM agent_capabilities").all() as Array<{ name: string }>;
    expect(caps.map((c) => c.name)).toContain("code-review");

    const skillRows = getDb().prepare("SELECT name FROM skill_registry").all() as Array<{ name: string }>;
    expect(skillRows.map((s) => s.name)).not.toContain("code-review");
  });

  it("agent id named like a skill does NOT create a registry row", async () => {
    const { registerAgent, getDb } = await loadRoute();
    const before = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;

    registerAgent({
      id: "ghost-skill-as-agent",
      name: "Ghost Skill As Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const after = (getDb().prepare("SELECT COUNT(*) as c FROM skill_registry").get() as { c: number }).c;
    expect(after).toBe(before);
  });

  it("agent capability report does NOT enable or trust a registry skill", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "skill-agent",
      name: "Skill Agent",
      role: "Reports skills",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    insertSkill(getDb(), { name: "stay-disabled", source_harness: "claude", dispatch_status: "incomplete" });
    const skillBefore = getDb().prepare("SELECT dispatch_status FROM skill_registry WHERE name = ?").get("stay-disabled") as { dispatch_status: string };
    expect(skillBefore.dispatch_status).toBe("incomplete");

    // Even with an observation that looks like enablement, the skill stays incomplete.
    await POST(
      new Request("http://localhost/api/skills/report", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skillId: "stay-disabled", action: "used", metadata: { source_harness: "claude" } }),
      })
    );

    const skillAfter = getDb().prepare("SELECT dispatch_status FROM skill_registry WHERE name = ?").get("stay-disabled") as { dispatch_status: string };
    expect(skillAfter.dispatch_status).toBe("incomplete");
  });
});
