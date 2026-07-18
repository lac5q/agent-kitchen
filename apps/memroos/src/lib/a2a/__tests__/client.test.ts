// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DispatchTask } from "@/lib/dispatch/types";
import type { RegisteredAgent } from "@/types";

const TASK: DispatchTask = {
  task_id: "task-outbound-1",
  context_id: "ctx-outbound-1",
  from_agent: "memroos",
  to_agent: "adk-prime",
  task_summary: "Check whether 97 is prime",
  input: { number: 97 },
  priority: 2,
  dispatched_at: "2026-05-05T09:30:00.000Z",
};

function makeAgent(metadata: Record<string, unknown> = {}): RegisteredAgent {
  return {
    id: "adk-prime",
    name: "ADK Prime",
    role: "Math helper",
    company: undefined,
    platform: "gemini",
    protocol: "a2a",
    status: "active",
    lastHeartbeat: null,
    currentTask: null,
    lessonsCount: 0,
    todayMemoryCount: 0,
    location: "tailscale",
    isRemote: true,
    latencyMs: null,
    capabilities: [],
    metadata,
    host: "worker.tailnet",
    port: 8001,
    healthEndpoint: "/health",
    tunnelUrl: null,
    createdAt: "2026-05-05T09:00:00.000Z",
    updatedAt: "2026-05-05T09:00:00.000Z",
    deregisteredAt: null,
  };
}

describe("A2A outbound client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts message:send to the registered A2A endpoint and preserves task/context ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: TASK.task_id, contextId: TASK.context_id, status: { state: "working" } }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { sendMessageToA2aAgent } = await import("../client");

    const result = await sendMessageToA2aAgent(
      makeAgent({ a2a: { endpointUrl: "http://localhost:8001/a2a/check_prime_agent" } }),
      TASK
    );

    expect(result).toMatchObject({ accepted: true, mode: "pushed" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/a2a/check_prime_agent/message:send",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      task_id: TASK.task_id,
      context_id: TASK.context_id,
      metadata: { memroosDelegated: true },
    });
    expect(body.message).toMatchObject({ taskId: TASK.task_id, contextId: TASK.context_id });
  });

  it("adds bearer auth only when metadata points at an existing environment variable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { state: "working" } })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("REMOTE_A2A_TOKEN", "remote-secret-token");
    const { sendMessageToA2aAgent } = await import("../client");

    await sendMessageToA2aAgent(
      makeAgent({
        a2a: {
          endpointUrl: "http://localhost:8001/a2a/check_prime_agent",
          outboundAuth: { envKey: "REMOTE_A2A_TOKEN" },
        },
      }),
      TASK
    );
    await sendMessageToA2aAgent(
      makeAgent({
        a2a: {
          endpointUrl: "http://localhost:8002/a2a/check_prime_agent",
          outboundAuth: { envKey: "MISSING_REMOTE_A2A_TOKEN" },
        },
      }),
      TASK
    );

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      authorization: "Bearer remote-secret-token",
    });
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty("authorization");
  });

  it("uses the configured remote timeout for outbound requests", async () => {
    vi.stubEnv("MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS", "1234");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { state: "working" } })));
    vi.stubGlobal("fetch", fetchMock);
    const { sendMessageToA2aAgent } = await import("../client");

    await sendMessageToA2aAgent(
      makeAgent({ a2a: { endpointUrl: "http://localhost:8001/a2a/check_prime_agent" } }),
      TASK
    );

    expect(timeoutSpy).toHaveBeenCalledWith(1234);
    expect(fetchMock.mock.calls[0][1].signal).toBeTruthy();
  });

  it("maps non-2xx responses to rejected without retaining long raw bodies", async () => {
    const longBody = "x".repeat(800);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(longBody, { status: 503 })));
    const { sendMessageToA2aAgent } = await import("../client");

    const result = await sendMessageToA2aAgent(
      makeAgent({ a2a: { endpointUrl: "http://localhost:8001/a2a/check_prime_agent" } }),
      TASK
    );

    expect(result).toMatchObject({ accepted: false, mode: "rejected" });
    expect(result.detail).toContain("503");
    expect(JSON.stringify(result)).not.toContain(longBody);
    expect(String(result.evidence?.body ?? "").length).toBeLessThanOrEqual(512);
  });

  it("redacts embedded URL credentials before display", async () => {
    const { redactUrlForDisplay } = await import("../client");

    expect(redactUrlForDisplay("https://user:pass@example.com/path")).toBe("https://example.com/path");
    expect(redactUrlForDisplay("https://user:pass@not a url/path")).toBe("https://not a url/path");
  });

  it("uses fallback endpoint sources for get and cancel task requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task: { id: TASK.task_id, status: { state: "canceled" } } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { cancelRemoteA2aTask, getRemoteA2aTask } = await import("../client");

    await getRemoteA2aTask(makeAgent({ a2a: { messageSendUrl: "https://agent.example/message:send" } }), TASK.task_id);
    await cancelRemoteA2aTask({ ...makeAgent(), tunnelUrl: "https://tunnel.example/a2a" }, TASK.task_id);

    expect(fetchMock.mock.calls[0][0]).toBe("http://worker.tailnet:8001/tasks/task-outbound-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://tunnel.example/a2a/tasks/task-outbound-1:cancel");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("rejects missing endpoint configuration before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendMessageToA2aAgent } = await import("../client");

    await expect(
      sendMessageToA2aAgent({ id: "no-endpoint", host: null, port: null, tunnelUrl: null, metadata: {} }, TASK),
    ).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
