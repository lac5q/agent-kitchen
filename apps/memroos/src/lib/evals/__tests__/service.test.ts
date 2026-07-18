// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EvalService } from "../service";

let db: Database.Database;

function insertRun(overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    id: "run-1",
    trace_id: "trace-1",
    agent_id: "agent-a",
    role: "engineer",
    composite_w: 0.87,
    trusted: 1,
    drift_agreement: 0.92,
    drift_status: "passed",
    layer_breakdown_json: JSON.stringify({ retrieval: 0.9, answer: 0.84 }),
    scorer_results_json: JSON.stringify([{ name: "faithful", score: 0.9 }]),
    judge_provider: "fixture",
    judge_model: "judge-1",
    judge_model_family: "fixture-family",
    prompt_template_version: "prompt-v1",
    prompt_hash: "sha256:prompt",
    golden_set_path: "golden/engineer.json",
    golden_set_version: "golden-v1",
    config_hash: "sha256:config",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:01:00.000Z",
    judge_score_json: JSON.stringify({
      score: 0.91,
      rubricScores: { faithful: 0.9, useful: 0.92, policy: 0.91 },
    }),
    ...overrides,
  };

  db.prepare(
    `INSERT INTO eval_runs (
      id, trace_id, agent_id, role, composite_w, trusted, drift_agreement, drift_status,
      layer_breakdown_json, scorer_results_json, judge_provider, judge_model, judge_model_family,
      prompt_template_version, prompt_hash, golden_set_path, golden_set_version, config_hash,
      started_at, completed_at, judge_score_json
    ) VALUES (
      @id, @trace_id, @agent_id, @role, @composite_w, @trusted, @drift_agreement, @drift_status,
      @layer_breakdown_json, @scorer_results_json, @judge_provider, @judge_model, @judge_model_family,
      @prompt_template_version, @prompt_hash, @golden_set_path, @golden_set_version, @config_hash,
      @started_at, @completed_at, @judge_score_json
    )`,
  ).run(row);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE eval_runs (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      composite_w REAL NOT NULL,
      trusted INTEGER NOT NULL,
      drift_agreement REAL NOT NULL,
      drift_status TEXT NOT NULL,
      layer_breakdown_json TEXT NOT NULL,
      scorer_results_json TEXT NOT NULL,
      judge_provider TEXT NOT NULL,
      judge_model TEXT NOT NULL,
      judge_model_family TEXT NOT NULL,
      prompt_template_version TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      golden_set_path TEXT NOT NULL,
      golden_set_version TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      judge_score_json TEXT
    );
  `);
});

afterEach(() => {
  db.close();
});

describe("EvalService", () => {
  it("maps persisted rows into eval run results with judge and drift metadata", () => {
    insertRun();
    const service = new EvalService(db);

    const run = service.getRunById("run-1");

    expect(run).toMatchObject({
      id: "run-1",
      traceId: "trace-1",
      agentId: "agent-a",
      compositeW: 0.87,
      trusted: true,
      judge: {
        score: 0.91,
        rubricScores: { faithful: 0.9, useful: 0.92, policy: 0.91 },
        model: "judge-1",
        provider: "fixture",
      },
      driftGuard: {
        status: "passed",
        agreement: 0.92,
        floor: 0.85,
      },
    });
  });

  it("selects the latest run for a trace and creates a seal rerun copy", () => {
    insertRun({ id: "older", completed_at: "2026-01-01T00:01:00.000Z" });
    insertRun({ id: "newer", completed_at: "2026-01-02T00:01:00.000Z", composite_w: 0.93 });
    const service = new EvalService(db);

    expect(service.getLatestRunForTrace("trace-1")).toMatchObject({
      id: "newer",
      compositeW: 0.93,
    });

    const rerun = service.runForTrace("trace-1", "agent-a");
    expect(rerun.id).toMatch(/^seal-rerun-/);
    expect(rerun.traceId).toBe("trace-1");
    expect(rerun.compositeW).toBe(0.93);
  });

  it("returns null for missing runs and throws on trace or agent mismatches", () => {
    insertRun();
    const service = new EvalService(db);

    expect(service.getRunById("missing")).toBeNull();
    expect(service.getLatestRunForTrace("missing")).toBeNull();
    expect(() => service.runForTrace("missing")).toThrow(/No eval run found/);
    expect(() => service.runForTrace("trace-1", "agent-b")).toThrow(/belongs to agent-a/);
  });

  it("falls back to zero judge scores for legacy malformed judge JSON", () => {
    insertRun({
      id: "malformed",
      judge_score_json: "{not-json",
      trusted: 0,
      drift_status: "halted",
    });

    expect(new EvalService(db).getRunById("malformed")).toMatchObject({
      trusted: false,
      driftGuard: { status: "halted" },
      judge: {
        score: 0,
        rubricScores: { faithful: 0, useful: 0, policy: 0 },
      },
    });
  });
});
