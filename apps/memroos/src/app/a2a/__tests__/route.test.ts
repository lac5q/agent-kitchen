// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `a2a-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const messageSendRoute = await import("../../message:send/route");
  const messageStreamRoute = await import("../../message:stream/route");
  const tasksRoute = await import("../../tasks/route");
  const taskRoute = await import("../../tasks/[id]/route");
  const cancelRoute = await import("../../tasks/[id]:cancel/route");
  const subscribeRoute = await import("../../tasks/[id]:subscribe/route");
  const a2aRoute = await import("../route");
  const registry = await import("@/lib/agent/registry");
  const store = await import("@/lib/a2a/task-store");
  const dbModule = await import("@/lib/db");
  return {
    messageSendRoute,
    messageStreamRoute,
    tasksRoute,
    taskRoute,
    cancelRoute,
    subscribeRoute,
    a2aRoute,
    ...registry,
    ...store,
    closeDb: dbModule.closeDb,
  };
}

function message(text = "hello") {
  return {
    messageId: crypto.randomUUID(),
    role: "user" as const,
    parts: [{ kind: "text" as const, text }],
  };
}

async function createAgentAndKey() {
  const routes = await loadRoutes();
  const { agent, apiKey } = routes.registerAgent({
    id: "caller-agent",
    name: "Caller Agent",
    role: "A2A caller",
    platform: "codex",
    protocol: "a2a",
    capabilities: [{ id: "a2a:send", name: "A2A Send", description: "", tags: [] }],
    issueApiKey: true,
  });
  return { routes, agent, apiKey: apiKey! };
}

function postRequest(url: string, body: object, apiKey?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("A2A HTTP+JSON routes", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("rejects POST /message:send without bearer auth", async () => {
    const { messageSendRoute } = await loadRoutes();

    const response = await messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message() })
    );

    expect(response.status).toBe(401);
  });

  it("accepts POST /message:send and returns a persisted task id", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("send task") }, apiKey)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(routes.getA2aTask(body.id)?.task.id).toBe(body.id);
  });

  it("returns a task created by send from GET /tasks/{id}", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("lookup task") }, apiKey)
    );
    const sent = await sendResponse.json();

    const response = await routes.taskRoute.GET(
      new Request(`http://localhost/tasks/${sent.id}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      }),
      { params: Promise.resolve({ id: sent.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe(sent.id);
  });

  it("transitions a working task to canceled from POST /tasks/{id}:cancel", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("cancel task") }, apiKey)
    );
    const sent = await sendResponse.json();
    routes.transitionA2aTask(sent.id, "working");

    const response = await routes.cancelRoute.POST(
      postRequest(`http://localhost/tasks/${sent.id}:cancel`, {}, apiKey),
      { params: Promise.resolve({ id: sent.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.state).toBe("canceled");
  });

  it("returns text/event-stream from POST /message:stream", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageStreamRoute.POST(
      postRequest("http://localhost/message:stream", { message: message("stream task") }, apiKey)
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: task.update");
  });

  it("returns text/event-stream from POST /tasks/{id}:subscribe for a permitted task", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("subscribe task") }, apiKey)
    );
    const sent = await sendResponse.json();

    const response = await routes.subscribeRoute.POST(
      postRequest(`http://localhost/tasks/${sent.id}:subscribe`, {}, apiKey),
      { params: Promise.resolve({ id: sent.id }) }
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: task.update");
  });

  it("GET /tasks returns 401 without bearer auth", async () => {
    const { tasksRoute } = await loadRoutes();

    const response = await tasksRoute.GET(
      new Request("http://localhost/tasks")
    );

    expect(response.status).toBe(401);
  });

  it("GET /tasks returns task list with valid auth", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.tasksRoute.GET(
      new Request("http://localhost/tasks", {
        headers: { authorization: `Bearer ${apiKey}` },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.timestamp).toBeTruthy();
  });

  it("GET /tasks/{id} returns 401 without bearer auth", async () => {
    const { taskRoute } = await loadRoutes();

    const response = await taskRoute.GET(
      new Request("http://localhost/tasks/some-id"),
      { params: Promise.resolve({ id: "some-id" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when POST /message:send receives invalid JSON (body null)", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageSendRoute.POST(
      new Request("http://localhost/message:send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: "not valid json {{{",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when POST /message:stream receives invalid JSON (body null)", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageStreamRoute.POST(
      new Request("http://localhost/message:stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: "not valid json {{{",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("maps non-object metadata to {} on POST /message:send", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageSendRoute.POST(
      postRequest(
        "http://localhost/message:send",
        { message: message("array metadata"), metadata: [1, 2, 3] },
        apiKey
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBeTruthy();
  });

  it("maps non-object metadata to {} on POST /message:stream", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.messageStreamRoute.POST(
      postRequest(
        "http://localhost/message:stream",
        { message: message("array metadata"), metadata: "string-meta" },
        apiKey
      )
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("event: task.update");
  });

  it("decodes URL-encoded task id from URL segment ending :cancel", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("cancel url decode") }, apiKey)
    );
    const sent = await sendResponse.json();
    routes.transitionA2aTask(sent.id, "working");

    const encodedId = encodeURIComponent(sent.id);
    const response = await routes.cancelRoute.POST(
      new Request(`http://localhost/tasks/${encodedId}:cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.state).toBe("canceled");
  });

  it("decodes URL-encoded task id and includes task + events in SSE from POST /tasks/{id}:subscribe", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.messageSendRoute.POST(
      postRequest("http://localhost/message:send", { message: message("subscribe url decode") }, apiKey)
    );
    const sent = await sendResponse.json();

    const encodedId = encodeURIComponent(sent.id);
    const response = await routes.subscribeRoute.POST(
      new Request(`http://localhost/tasks/${encodedId}:subscribe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}),
      })
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    expect(dataLines.length).toBeGreaterThanOrEqual(1);
    expect(dataLines[0].id).toBe(sent.id);
  });
});

describe("A2A JSON-RPC compatibility route", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  function rpcRequest(method: string, params: Record<string, unknown>, apiKey: string, id: string | number = "rpc-1") {
    return postRequest("http://localhost/a2a", { jsonrpc: "2.0", id, method, params }, apiKey);
  }

  it("dispatches message/send", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.a2aRoute.POST(
      rpcRequest("message/send", { message: message("rpc send") }, apiKey)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result.id).toBeTruthy();
  });

  it("dispatches tasks/get", async () => {
    const { routes, apiKey } = await createAgentAndKey();
    const sendResponse = await routes.a2aRoute.POST(
      rpcRequest("message/send", { message: message("rpc lookup") }, apiKey, "send")
    );
    const sent = await sendResponse.json();

    const response = await routes.a2aRoute.POST(
      rpcRequest("tasks/get", { id: sent.result.id }, apiKey, "get")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("get");
    expect(body.result.id).toBe(sent.result.id);
  });

  it("returns -32601 for unsupported methods", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.a2aRoute.POST(
      rpcRequest("tasks/unknown", {}, apiKey, "unknown")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error.code).toBe(-32601);
  });

  it("rejects streaming methods with the exact fallback message", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.a2aRoute.POST(
      rpcRequest("message/stream", { message: message("stream") }, apiKey, "stream")
    );
    const body = await response.json();

    expect(body.error).toMatchObject({
      code: -32000,
      message: "Streaming methods use /message:stream or /tasks/{id}:subscribe",
    });
  });

  it("handles invalid JSON body gracefully (null body)", async () => {
    const { routes, apiKey } = await createAgentAndKey();

    const response = await routes.a2aRoute.POST(
      new Request("http://localhost/a2a", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: "not valid json",
      })
    );
    const body = await response.json();

    // dispatchA2aJsonRpc receives null body and returns an error response
    expect(body.error).toBeTruthy();
    expect(body.ok).toBe(false);
  });

  it("returns 401 for JSON-RPC request without auth", async () => {
    const { a2aRoute } = await loadRoutes();

    const response = await a2aRoute.POST(
      new Request("http://localhost/a2a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "message/send", params: {} }),
      })
    );

    expect(response.status).toBe(401);
  });
});
