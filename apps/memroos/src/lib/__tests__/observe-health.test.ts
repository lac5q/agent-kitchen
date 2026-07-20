import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  listObserveHarnessHealth,
  platformKeyForHarness,
} from "@/lib/observe-health";

describe("observe harness health", () => {
  it("lists all harnesses including Pi and Wave 2/3 maturity notes", () => {
    const db = new Database(":memory:");
    initSchema(db);
    db.prepare(
      `INSERT INTO agent_session_captures (
         id, tenant_id, source_agent_id, runtime, project, repo_path, session_id, task_id,
         status, capture_health, model_route_json, summary, decision_intent_json, sources_json,
         files_json, commands_json, errors_json, verification_json, metadata_json, raw_artifact_id,
         capture_hash, captured_at, updated_at
       ) VALUES (
         'c1', 'default-tenant', 'pi', 'pi', null, null, 's1', null,
         'handoff_ready', 'ok', '{}', 'Pi capture', '{}', '[]',
         '[]', '[]', '[]', '[]', '{}', null,
         'hash1', '2026-07-18T12:00:00.000Z', '2026-07-18T12:00:00.000Z'
       )`
    ).run();

    const rows = listObserveHarnessHealth(db, { depthSetting: "relevant" });
    expect(rows.some((r) => r.harness === "pi" && r.captureCount === 1)).toBe(true);
    expect(rows.some((r) => r.harness === "cursor" && r.wave === 2)).toBe(true);
    expect(rows.some((r) => r.harness === "antigravity" && r.maturity === "limited")).toBe(true);
    expect(rows.find((r) => r.harness === "cursor")?.notes).toMatch(/MCP onboard/i);
    expect(rows.find((r) => r.harness === "factory")?.notes).toMatch(/hooks/i);
    expect(rows.find((r) => r.harness === "pi")?.notes).toMatch(/Pi sessions/i);
    db.close();
  });

  it("defaults depthSetting from MEMROOS_CAPTURE_DEPTH", () => {
    const prev = process.env.MEMROOS_CAPTURE_DEPTH;
    process.env.MEMROOS_CAPTURE_DEPTH = "full";
    const db = new Database(":memory:");
    initSchema(db);
    const rows = listObserveHarnessHealth(db);
    expect(rows.every((r) => r.depthSetting === "full")).toBe(true);
    db.close();
    if (prev === undefined) delete process.env.MEMROOS_CAPTURE_DEPTH;
    else process.env.MEMROOS_CAPTURE_DEPTH = prev;
  });
});

describe("observe harness health OBSERVE-14 visibility", () => {
  it("includes errorCount defaulting to 0 and exposes agentsByHarness", () => {
    const db = new Database(":memory:");
    initSchema(db);
    // Seed a successful capture for `pi` so we can prove errorCount counts
    // only failed rows and agentsByHarness counts registered_agents.
    db.prepare(
      `INSERT INTO agent_session_captures (
         id, tenant_id, source_agent_id, runtime, project, repo_path, session_id, task_id,
         status, capture_health, model_route_json, summary, decision_intent_json, sources_json,
         files_json, commands_json, errors_json, verification_json, metadata_json, raw_artifact_id,
         capture_hash, captured_at, updated_at
       ) VALUES (
         'c-pi-ok', 'default-tenant', 'pi', 'pi', null, null, 's-pi', null,
         'handoff_ready', 'ok', '{}', 'Pi ok', '{}', '[]',
         '[]', '[]', '[]', '[]', '{}', null,
         'hash-pi-ok', '2026-07-18T12:00:00.000Z', '2026-07-18T12:00:00.000Z'
       )`
    ).run();
    db.prepare(
      `INSERT INTO agent_session_captures (
         id, tenant_id, source_agent_id, runtime, project, repo_path, session_id, task_id,
         status, capture_health, model_route_json, summary, decision_intent_json, sources_json,
         files_json, commands_json, errors_json, verification_json, metadata_json, raw_artifact_id,
         capture_hash, captured_at, updated_at
       ) VALUES (
         'c-pi-failed', 'default-tenant', 'pi', 'pi', null, null, 's-pi-2', null,
         'failed', 'failed', '{}', 'Pi failed', '{}', '[]',
         '[]', '[]', '[]', '[]', '{}', null,
         'hash-pi-failed', '2026-07-18T13:00:00.000Z', '2026-07-18T13:00:00.000Z'
       )`
    ).run();

    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("agent-pi-1", "Pi-agent", "coding", "pi", "rest", "active");
    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("agent-pi-2", "Pi-agent-2", "coding", "PI", "rest", "active");
    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("agent-claude-1", "Claude-agent", "coding", "claude", "rest", "active");
    db.prepare(
      `INSERT INTO registered_agents (id, name, role, platform, protocol, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("agent-droid-1", "Droid-agent", "coding", "droid", "rest", "active");

    const rows = listObserveHarnessHealth(db, { depthSetting: "relevant" });
    const piRow = rows.find((r) => r.harness === "pi");
    const claudeRow = rows.find((r) => r.harness === "claude");
    const factoryRow = rows.find((r) => r.harness === "factory");
    const antigravityRow = rows.find((r) => r.harness === "antigravity");
    const cursorRow = rows.find((r) => r.harness === "cursor");

    expect(piRow).toBeDefined();
    expect(piRow!.captureCount).toBe(2);
    expect(piRow!.errorCount).toBe(1);
    expect(piRow!.errorRate).toBeNull();
    expect(piRow!.agentsByHarness).toBe(2);

    expect(claudeRow).toBeDefined();
    expect(claudeRow!.errorCount).toBe(0);
    expect(claudeRow!.agentsByHarness).toBe(1);
    expect(antigravityRow!.errorCount).toBe(0);
    expect(antigravityRow!.agentsByHarness).toBe(0);

    // factory maps onto `droid` so the droid registered_agents row counts.
    expect(factoryRow).toBeDefined();
    expect(factoryRow!.agentsByHarness).toBe(1);

    // cursor has zero onboarded agents right now; the field is still present.
    expect(cursorRow).toBeDefined();
    expect(cursorRow!.agentsByHarness).toBe(0);
    expect(cursorRow!.errorCount).toBe(0);
    db.close();
  });

  it("platformKeyForHarness pins the factory -> droid alias", () => {
    expect(platformKeyForHarness("factory")).toBe("droid");
    expect(platformKeyForHarness("claude")).toBe("claude");
    expect(platformKeyForHarness("pi")).toBe("pi");
    expect(platformKeyForHarness("antigravity")).toBe("antigravity");
  });
});
