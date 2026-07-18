import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listObserveHarnessHealth } from "@/lib/observe-health";

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
