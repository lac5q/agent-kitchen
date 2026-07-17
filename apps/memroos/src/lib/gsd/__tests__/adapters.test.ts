// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-adapters-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "adapters.db");

async function loadModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const dbModule = await import("@/lib/db");
  const adapters = await import("@/lib/gsd/adapters");
  return { getDb: dbModule.getDb, closeDb: dbModule.closeDb, ...adapters };
}

const ACTOR = "adapter-test-agent";
const GOAL_ID = "adapter-goal-coverage";
const FIXED_NOW = new Date("2026-07-07T12:00:00.000Z");

describe("GSD adapters", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadModules();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("executes core task lifecycle actions without owning state", async () => {
    const { getDb, executeGsdAdapterAction, validateGsdAdapterContract } = await loadModules();
    const db = getDb();
    const now = () => FIXED_NOW;

    const created = executeGsdAdapterAction(db, {
      adapterId: "codex",
      actorAgentId: ACTOR,
      action: "create_task",
      payload: { title: "Adapter lifecycle", goal_id: GOAL_ID, lane: "code" },
      now,
    });
    expect(created.ok).toBe(true);
    expect(validateGsdAdapterContract(created)).toEqual([]);

    const context = executeGsdAdapterAction(db, {
      adapterId: "hermes",
      actorAgentId: ACTOR,
      action: "request_context",
      payload: { goalId: GOAL_ID, lane: "code" },
      now,
    });
    expect(context.ok).toBe(true);
    expect(context.result).toMatchObject({ packet: { goal: { id: GOAL_ID } } });

    const resume = executeGsdAdapterAction(db, {
      adapterId: "cursor",
      actorAgentId: ACTOR,
      action: "resume",
      payload: { goalId: GOAL_ID, lane: "code" },
      now,
    });
    expect(resume.ok).toBe(true);

    const standup = executeGsdAdapterAction(db, {
      adapterId: "discord",
      actorAgentId: ACTOR,
      action: "standup",
      payload: { goalId: GOAL_ID, lane: "code" },
      now,
    });
    expect(standup.ok).toBe(true);

    const proof = executeGsdAdapterAction(db, {
      adapterId: "telegram",
      actorAgentId: ACTOR,
      action: "post_proof",
      payload: {
        goalId: GOAL_ID,
        lane: "code",
        proof: { focused_tests: ["src/lib/gsd/__tests__/adapters.test.ts"] },
      },
      now,
    });
    expect(proof.ok).toBe(true);
    expect(proof.result).toMatchObject({ status: expect.any(String) });
  });

  it("runs discuss, approval, audit, lane eval, and model route actions", async () => {
    const { getDb, executeGsdAdapterAction } = await loadModules();
    const db = getDb();
    const now = () => FIXED_NOW;

    executeGsdAdapterAction(db, {
      adapterId: "codex",
      actorAgentId: ACTOR,
      action: "create_task",
      payload: { title: "Council goal", goalId: GOAL_ID, lane: "research" },
      now,
    });

    const approval = executeGsdAdapterAction(db, {
      adapterId: "claude_code",
      actorAgentId: ACTOR,
      action: "request_approval",
      payload: { goalId: GOAL_ID, lane: "research", topic: "ship adapter tests" },
      now,
    });
    expect(approval.action).toBe("request_approval");
    expect(approval.contract.allowedActions).toContain("request_approval");

    const discuss = executeGsdAdapterAction(db, {
      adapterId: "hermes",
      actorAgentId: ACTOR,
      action: "discuss",
      payload: {
        goalId: GOAL_ID,
        lane: "research",
        topic: "adapter discuss coverage",
        roles: [
          { role: "chair", agentId: ACTOR, mandate: "facilitate" },
          { role: "validator", agentId: ACTOR, mandate: "validate" },
        ],
        taskBudget: { maxRounds: 2, maxAgents: 4 },
        contributions: [{ role: "chair", agentId: ACTOR, summary: "coverage added" }],
        verdict: {
          decision: "approve",
          summary: "approved",
          actionItems: [],
          risks: [],
          validatorPass: true,
        },
      },
      now,
    });
    expect(discuss.ok).toBe(true);

    const audit = executeGsdAdapterAction(db, {
      adapterId: "codex",
      actorAgentId: ACTOR,
      action: "skill_audit",
      payload: { persistProposals: false },
      now,
    });
    expect(audit.ok).toBe(true);
    expect(audit.result).toMatchObject({ skillsScanned: expect.any(Number) });

    const laneEval = executeGsdAdapterAction(db, {
      adapterId: "cursor",
      actorAgentId: ACTOR,
      action: "lane_eval",
      payload: { caseIds: ["research-lane-source-coverage"], persistReceipts: false },
      now,
    });
    expect(laneEval.ok).toBe(true);
    expect(laneEval.result).toMatchObject({ totalCases: 1, failedCases: 0 });

    const modelRoute = executeGsdAdapterAction(db, {
      adapterId: "codex",
      actorAgentId: ACTOR,
      action: "model_route",
      payload: { taskClass: "classification", sensitive: true },
      now,
    });
    expect(modelRoute.ok).toBe(true);
    expect(modelRoute.result).toMatchObject({ tier: expect.any(String), taskClass: "classification" });
  });

  it("rejects unsupported actions and contract violations", async () => {
    const { getDb, executeGsdAdapterAction, validateGsdAdapterContract, GSD_ADAPTER_CONTRACT } =
      await loadModules();

    expect(() =>
      executeGsdAdapterAction(getDb(), {
        adapterId: "codex",
        actorAgentId: ACTOR,
        action: "not_allowed" as never,
        payload: {},
      })
    ).toThrow(/Unsupported adapter action/);

    const violations = validateGsdAdapterContract({
      adapterId: "codex",
      action: "create_task",
      ok: true,
      ownsState: true as never,
      result: {},
      contract: GSD_ADAPTER_CONTRACT,
    });
    expect(violations).toContain("adapter attempted to own state");

    const actionViolation = validateGsdAdapterContract({
      adapterId: "codex",
      action: "memory_write" as never,
      ok: true,
      ownsState: false,
      result: {},
      contract: GSD_ADAPTER_CONTRACT,
    });
    expect(actionViolation).toContain("adapter action outside contract");
  });
});
