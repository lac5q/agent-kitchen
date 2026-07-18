// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import type { RemoteAgentConfig } from "@/types";

const TEST_DB_DIR = path.join(os.tmpdir(), `a2a-adapter-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "adapter.db");

const TASK = {
  task_id: "task-adapter-1",
  context_id: "ctx-adapter-1",
  from_agent: "memroos",
  to_agent: "adk-prime",
  task_summary: "Check whether 97 is prime",
  input: { number: 97 },
  priority: 1,
  dispatched_at: "2026-05-05T09:45:00.000Z",
};

function makeRemoteAgent(): RemoteAgentConfig {
  return {
    id: "adk-prime",
    name: "ADK Prime",
    role: "Math helper",
    platform: "gemini",
    protocol: "a2a",
    location: "tailscale",
    host: "worker.tailnet",
    port: 8001,
    healthEndpoint: "/health",
    metadata: {
      a2a: {
        endpointUrl: "http://localhost:8001/a2a/check_prime_agent",
        source: "adk",
      },
    },
  };
}

async function loadAdapterModules() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const adapterModule = await import("../a2a-adapter");
  const factory = await import("../adapter-factory");
  const store = await import("@/lib/a2a/task-store");
  const dbModule = await import("@/lib/db");
  return { ...adapterModule, ...factory, ...store, closeDb: dbModule.closeDb };
}

describe("a2aAdapter", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadAdapterModules();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    vi.unstubAllGlobals();
  });

  it("supports Gemini/OpenClaw platforms and wins adapter selection for protocol: a2a", async () => {
    const { a2aAdapter, selectAdapter } = await loadAdapterModules();

    expect(a2aAdapter.platform).toEqual(expect.arrayContaining(["gemini", "openclaw"]));
    expect(selectAdapter(makeRemoteAgent())).toBe(a2aAdapter);
  });

  it("updates the Memroos task to completed when the remote A2A task completes", async () => {
    const { a2aAdapter, createA2aTask, getA2aTask } = await loadAdapterModules();
    createA2aTask({
      taskId: TASK.task_id,
      contextId: TASK.context_id,
      callerAgentId: TASK.from_agent,
      targetAgentId: TASK.to_agent,
      message: {
        messageId: "msg-adapter-1",
        role: "user",
        parts: [{ kind: "text", text: TASK.task_summary }],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: TASK.task_id,
            contextId: TASK.context_id,
            status: { state: "completed" },
            artifacts: [{ artifactId: "result", parts: [{ kind: "text", text: "97 is prime" }] }],
          }),
          { status: 200 }
        )
      )
    );

    const result = await a2aAdapter.dispatch(TASK, makeRemoteAgent());
    const record = getA2aTask(TASK.task_id);

    expect(result).toMatchObject({ accepted: true, mode: "pushed" });
    expect(record?.task.status.state).toBe("completed");
    expect(record?.task.artifacts?.[0]).toMatchObject({ artifactId: "result" });
  });

  it("rejects dispatches for unknown A2A agents without a network call", async () => {
    const { a2aAdapter } = await loadAdapterModules();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await a2aAdapter.dispatch({
      ...TASK,
      to_agent: "missing-a2a-agent",
    });

    expect(result).toMatchObject({
      accepted: false,
      mode: "rejected",
      detail: "Unknown A2A agent: missing-a2a-agent",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
