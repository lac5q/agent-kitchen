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
    db.close();
  });
});
