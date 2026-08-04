// @vitest-environment node
/**
 * Phase 145 (FLEET-13..16) — Integration test for the GSD adapter route
 * pre-execution policy gate.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-adapter-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "adapter.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent/registry");
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    route,
    closeDb: dbModule.closeDb,
  };
}

function request(url: string, apiKey?: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

describe("POST /api/gsd/adapter", () => {
  let savedLegacyFlag: string | undefined;

  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    savedLegacyFlag = process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    if (savedLegacyFlag === undefined) {
      delete process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES;
    } else {
      process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = savedLegacyFlag;
    }
  });

  it("returns 403 with a policy receipt when the policy gate denies", async () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "off";
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request("http://localhost/api/gsd/adapter", agent.apiKey, {
        method: "POST",
        body: JSON.stringify({
          adapterId: "hermes",
          action: "create_task",
          payload: { title: "Policy gate test", goalId: "goal-policy-1" },
        }),
      }) as any
    );

    const payload = await res.json();
    expect(res.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.adapterId).toBe("hermes");
    expect(payload.action).toBe("create_task");
    expect(payload.policyReceipt).toMatchObject({
      domain: "capability",
      action: "create_task",
      ruleMatched: "capability.dispatch",
      outcome: "deny",
      actorId: "agent-alpha",
    });
    expect(payload.policyReceipt.policyVersion).toBeDefined();
    expect(payload.policyReceipt.createdAt).toBeDefined();
    expect(payload.policyReceipt).not.toHaveProperty("content");
    expect(payload.policyReceipt).not.toHaveProperty("payload");
    expect(payload.timestamp).toBeDefined();
  });

  it("proceeds to execute the action when the policy gate allows", async () => {
    process.env.MEMROOS_ALLOW_LEGACY_UNDECLARED_CAPABILITIES = "on";
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request("http://localhost/api/gsd/adapter", agent.apiKey, {
        method: "POST",
        body: JSON.stringify({
          adapterId: "hermes",
          action: "create_task",
          payload: { title: "Policy gate allow", goalId: "goal-policy-2" },
        }),
      }) as any
    );

    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.adapterId).toBe("hermes");
    expect(payload.action).toBe("create_task");
    expect(payload.result).toBeDefined();
    expect(payload.policyReceipt).toBeUndefined();
  });
});
