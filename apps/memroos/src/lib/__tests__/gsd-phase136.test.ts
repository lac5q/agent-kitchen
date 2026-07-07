// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-phase136-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "phase136.db");

async function loadDb() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  return import("@/lib/db");
}

describe("GSD adapters + safety slice", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadDb();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("keeps adapters stateless over create_task and request_context", async () => {
    const { getDb } = await loadDb();
    const { executeGsdAdapterAction, validateGsdAdapterContract } = await import("@/lib/gsd/adapters");

    const created = executeGsdAdapterAction(getDb(), {
      adapterId: "codex",
      actorAgentId: "agent-alpha",
      action: "create_task",
      payload: { title: "Adapter goal", lane: "code", goalId: "adapter-goal-1" },
    });
    expect(created.ownsState).toBe(false);
    expect(validateGsdAdapterContract(created)).toEqual([]);

    const context = executeGsdAdapterAction(getDb(), {
      adapterId: "hermes",
      actorAgentId: "agent-alpha",
      action: "request_context",
      payload: { goalId: "adapter-goal-1", lane: "code" },
    });
    expect(context.ok).toBe(true);
    expect(context.contract.forbiddenOwnership).toContain("task_state");
  });

  it("blocks secrets, destructive actions, and shared-mode git fallback", async () => {
    const { getDb } = await loadDb();
    const { runGsdAdapterSafetyCheck } = await import("@/lib/gsd/adapter-safety");

    const secretBlock = runGsdAdapterSafetyCheck(getDb(), {
      action: "send",
      content: "token ghp_123456789012345678901234567890123456",
      actorAgentId: "agent-alpha",
    });
    expect(secretBlock.allowed).toBe(false);
    expect(secretBlock.blockedReasons).toContain("secrets_or_pii_scan_blocked");

    const destructiveBlock = runGsdAdapterSafetyCheck(getDb(), {
      action: "destructive",
      content: "delete production table",
      actorAgentId: "agent-alpha",
      destructive: true,
      approvalGranted: false,
    });
    expect(destructiveBlock.allowed).toBe(false);
    expect(destructiveBlock.blockedReasons).toContain("destructive_action_requires_approval");

    const fallbackBlock = runGsdAdapterSafetyCheck(getDb(), {
      action: "write",
      content: "sync local git corpus",
      actorAgentId: "agent-alpha",
      sharedMode: true,
      requestedLocalGitFallback: true,
    });
    expect(fallbackBlock.allowed).toBe(false);
    expect(fallbackBlock.honestDegradation).toMatch(/cannot silently fall back/i);
  });
});
