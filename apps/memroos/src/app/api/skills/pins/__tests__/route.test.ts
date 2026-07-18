// @vitest-environment node
/**
 * Phase 149 / SKILLTRUST-04 — API route tests for /api/skills/pins and
 * /api/skills/pins/[id]/rollback.
 *
 * Covers:
 *   - POST /api/skills/pins 401 / 403 / 200
 *   - POST /api/skills/pins fails when the skill is not dispatchable
 *   - GET /api/skills/pins works without auth (read-only)
 *   - POST /api/skills/pins/[id]/rollback 401 / 403 / 200
 *   - Rollback writes audit row + flips current/prior
 *   - 404 for unknown pin id
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-pins-route-${crypto.randomUUID()}`
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
  const { getDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const route = await import("../route");
  const db = getDb();
  initSchema(db);
  return { route, db };
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
      overrides.name ?? "pin-route-skill",
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

function insertAgent(
  db: import("better-sqlite3").Database,
  id: string,
  name: string
): void {
  db.prepare(
    `INSERT INTO registered_agents (
      id, name, role, platform, protocol, status, location
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, "operator", "local", "rest", "active", "local");
}

function makePost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/skills/pins", () => {
  it("401 when no operator key configured", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost("https://example.com/api/skills/pins", {
        agent_id: "a-1",
        skill_name: "x",
        current_version: "1.0.0",
        current_content_hash: "a".repeat(64),
        actor: "alice",
      })
    );
    expect(res.status).toBe(401);
  });

  it("403 with wrong operator key", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "x",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer wrong-key" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("200 — creates a pin for an enabled+complete skill", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    insertAgent(db, "a-ok", "Agent OK");
    const skillId = insertSkillRow(db, {
      name: "pin-ok",
      content_hash: "1".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-ok",
          skill_name: "pin-ok",
          skill_id: skillId,
          current_version: "1.0.0",
          current_content_hash: "1".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pin.agent_id).toBe("a-ok");
    expect(json.pin.skill_name).toBe("pin-ok");
    expect(json.pin.current_version).toBe("1.0.0");
  });

  it("400 — pin against non-dispatchable skill is rejected", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    insertAgent(db, "a-bad", "Agent Bad");
    const skillId = insertSkillRow(db, {
      name: "pin-bad",
      dispatch_status: "review",
    });
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-bad",
          skill_name: "pin-bad",
          skill_id: skillId,
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/dispatch_status/);
  });

  it("400 — pin with malformed hash is rejected", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "x",
          current_version: "1.0.0",
          current_content_hash: "short",
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — missing actor is rejected", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "x",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
  });

  it("400 — rejects malformed bodies and required pin fields", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();

    const invalidJson = await route.POST(
      new Request("https://example.com/api/skills/pins", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer right-key",
        },
        body: "{",
      })
    );
    expect(invalidJson.status).toBe(400);

    const nonObject = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        [],
        { authorization: "Bearer right-key" }
      )
    );
    expect(nonObject.status).toBe(400);
    expect((await nonObject.json()).error).toBe("Body must be an object");

    const missingSkillName = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: " ",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingSkillName.status).toBe(400);
    expect((await missingSkillName.json()).error).toMatch(/skill_name/);

    const missingAgentId = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: " ",
          skill_name: "pin",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingAgentId.status).toBe(400);
    expect((await missingAgentId.json()).error).toMatch(/agent_id/);

    const missingVersion = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "pin",
          current_version: "",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(missingVersion.status).toBe(400);
    expect((await missingVersion.json()).error).toMatch(/current_version/);

    const badSkillId = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "pin",
          skill_id: "nope",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(badSkillId.status).toBe(400);
    expect((await badSkillId.json()).error).toMatch(/skill_id/);
  });

  it("500 — reports unexpected pin creation failures", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    vi.doMock("@/lib/skills/skill-sync-governance", async () => {
      const actual = await vi.importActual<typeof import("@/lib/skills/skill-sync-governance")>(
        "@/lib/skills/skill-sync-governance"
      );
      return {
        ...actual,
        createOrUpdateAgentVersionPin: () => {
          throw new Error("pin store exploded");
        },
      };
    });
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    const route = await import("../route");
    initSchema(getDb());

    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-1",
          skill_name: "pin",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("pin store exploded");
    vi.doUnmock("@/lib/skills/skill-sync-governance");
  });

  it("400 — pin against unknown agent is rejected", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route } = await loadRouteAndDb();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "ghost-agent",
          skill_name: "x",
          current_version: "1.0.0",
          current_content_hash: "a".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/agent/);
  });
});

describe("GET /api/skills/pins (read-only)", () => {
  it("200 without operator auth", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { route } = await loadRouteAndDb();
    const res = await route.GET(
      new Request("https://example.com/api/skills/pins", { method: "GET" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.items)).toBe(true);
  });

  it("filters by agent_id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    insertAgent(db, "ax", "Ax");
    insertAgent(db, "ay", "Ay");
    const okSkill = insertSkillRow(db, {
      name: "ok-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    for (const agent of ["ax", "ay"]) {
      await route.POST(
        makePost(
          "https://example.com/api/skills/pins",
          {
            agent_id: agent,
            skill_name: "ok-skill",
            skill_id: okSkill,
            current_version: "1.0.0",
            current_content_hash: "0".repeat(64),
            actor: "alice",
          },
          { authorization: "Bearer right-key" }
        )
      );
    }
    const res = await route.GET(
      new Request("https://example.com/api/skills/pins?agent_id=ax", {
        method: "GET",
      })
    );
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].agent_id).toBe("ax");
  });

  it("filters by skill_name and normalizes invalid pagination", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    insertAgent(db, "filter-agent", "Filter Agent");
    const skillId = insertSkillRow(db, {
      name: "filter-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
    });

    await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "filter-agent",
          skill_name: "filter-skill",
          skill_id: skillId,
          current_version: "1.0.0",
          current_content_hash: "0".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );

    const res = await route.GET(
      new Request("https://example.com/api/skills/pins?skill_name=filter-skill&limit=NaN&offset=-1", {
        method: "GET",
      })
    );
    const json = await res.json();
    expect(json.limit).toBe(50);
    expect(json.offset).toBe(0);
    expect(json.filters.skill_name).toBe("filter-skill");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].skill_name).toBe("filter-skill");
  });
});

describe("POST /api/skills/pins/[id]/rollback", () => {
  async function loadPinRoute() {
    return await import("../by-id/[id]/rollback/route");
  }

  it("401 without operator key", async () => {
    delete process.env["MEMROOS_OPERATOR_API_KEY"];
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await loadPinRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/1/rollback",
        { operator: "alice" }
      )
    );
    expect(res.status).toBe(401);
  });

  it("403 with wrong key", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await loadPinRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/1/rollback",
        { operator: "alice" },
        { authorization: "Bearer wrong-key" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("200 — rolls back and writes audit row", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { route, db } = await loadRouteAndDb();
    insertAgent(db, "a-rb", "Agent RB");

    // Create a pin then update it so prior_version exists.
    await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-rb",
          skill_name: "rb-route",
          skill_id: null,
          current_version: "1.0.0",
          current_content_hash: "1".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    const update = await route.POST(
      makePost(
        "https://example.com/api/skills/pins",
        {
          agent_id: "a-rb",
          skill_name: "rb-route",
          skill_id: null,
          current_version: "2.0.0",
          current_content_hash: "2".repeat(64),
          actor: "alice",
        },
        { authorization: "Bearer right-key" }
      )
    );
    const pinId = (await update.json()).pin.id;

    const rbRoute = await loadPinRoute();
    const res = await rbRoute.POST(
      makePost(
        `https://example.com/api/skills/pins/${pinId}/rollback`,
        { operator: "alice", reason: "regression" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ id: String(pinId) }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pin.current_version).toBe("1.0.0");
    expect(json.pin.current_content_hash).toBe("1".repeat(64));
    expect(json.pin.prior_version).toBeNull();
    expect(json.pin.rolled_back_by).toBe("alice");

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.pin.rolled_back'
             AND entity_id = ?`
      )
      .get(String(pinId)) as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("404 — unknown pin id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await loadPinRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/9999999/rollback",
        { operator: "alice" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ id: "9999999" }) }
    );
    expect(res.status).toBe(404);
  });

  it("400 — non-numeric pin id", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await loadPinRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/abc/rollback",
        { operator: "alice" },
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ id: "abc" }) }
    );
    expect(res.status).toBe(400);
  });

  it("400 — missing operator in body", async () => {
    process.env["MEMROOS_OPERATOR_API_KEY"] = "right-key";
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(getDb());
    const route = await loadPinRoute();
    const res = await route.POST(
      makePost(
        "https://example.com/api/skills/pins/1/rollback",
        {},
        { authorization: "Bearer right-key" }
      ),
      { params: Promise.resolve({ id: "1" }) }
    );
    expect(res.status).toBe(400);
  });
});
