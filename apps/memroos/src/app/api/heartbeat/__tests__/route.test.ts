// @vitest-environment node
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// Mock fs/promises before importing the route
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(),
  };
});

// Mock constants
vi.mock("@/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants")>();
  return {
    ...actual,
    AGENT_CONFIGS_PATH: "/mock/agent-configs",
  };
});

// Dynamic imports after mocks are hoisted
const { GET } = await import("../route");
const { readFile } = await import("fs/promises");

const mockReadFile = vi.mocked(readFile);
const TEST_DB_DIR = path.join(os.tmpdir(), `heartbeat-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

function makeRequest(agent: string | null): Request {
  const url = agent !== null
    ? `http://localhost:3002/api/heartbeat?agent=${agent}`
    : `http://localhost:3002/api/heartbeat`;
  return new Request(url);
}

describe("GET /api/heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when agentId contains '..'", async () => {
    const req = makeRequest("../etc/passwd");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ content: null });
  });

  it("returns 400 when agentId contains '/'", async () => {
    const req = makeRequest("some/agent");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ content: null });
  });

  it("returns 400 when agentId contains '\\'", async () => {
    const req = makeRequest("agent\\name");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ content: null });
  });

  it("returns 400 when agentId is empty or missing", async () => {
    const req = makeRequest(null);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ content: null });
  });

  it("returns { content: string } with last 20 non-empty lines for valid agentId with existing file", async () => {
    const fileLines = Array.from({ length: 25 }, (_, i) => `Line ${i + 1}`);
    mockReadFile.mockResolvedValueOnce(fileLines.join("\n") as never);

    const req = makeRequest("alba");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBeTruthy();
    // Should have last 20 lines (lines 6-25)
    const returnedLines = body.content.split("\n");
    expect(returnedLines).toHaveLength(20);
    expect(returnedLines[0]).toBe("Line 6");
    expect(returnedLines[19]).toBe("Line 25");
  });

  it("returns { content: null } when file does not exist (ENOENT)", async () => {
    const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    mockReadFile.mockRejectedValueOnce(err as never);

    const req = makeRequest("alba");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ content: null });
  });
});

async function loadPostRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent/registry");
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return { ...registry, POST: route.POST, closeDb: dbModule.closeDb };
}

describe("POST /api/heartbeat", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadPostRoute();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("rejects missing, invalid, and body-only agent identity", async () => {
    const { POST, registerAgent } = await loadPostRoute();
    registerAgent({
      id: "heartbeat-agent",
      name: "Heartbeat Agent",
      role: "Reports liveness",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const body = JSON.stringify({ agentId: "heartbeat-agent", status: "active" });
    expect((await POST(new Request("http://localhost/api/heartbeat", { method: "POST", body }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/heartbeat", {
            method: "POST",
            headers: { authorization: "Bearer nope" },
            body,
          })
        )
      ).status
    ).toBe(401);
  });

  it("records a valid authenticated heartbeat", async () => {
    const { POST, listAllAgentsUnscoped, registerAgent } = await loadPostRoute();
    const { apiKey } = registerAgent({
      id: "heartbeat-agent",
      name: "Heartbeat Agent",
      role: "Reports liveness",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await POST(
      new Request("http://localhost/api/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ status: "active", currentTask: "checking in" }),
      })
    );

    expect(res.status).toBe(200);
    const agent = listAllAgentsUnscoped().find((a) => a.id === "heartbeat-agent");
    expect(agent).toMatchObject({
      id: "heartbeat-agent",
      status: "active",
      currentTask: "checking in",
    });
  });
});
