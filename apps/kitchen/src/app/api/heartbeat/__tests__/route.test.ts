// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises before importing the route
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(),
  };
});

// Mock constants
vi.mock("@/lib/constants", () => ({
  AGENT_CONFIGS_PATH: "/mock/agent-configs",
}));

// Dynamic imports after mocks are hoisted
const { GET } = await import("../route");
const { readFile } = await import("fs/promises");

const mockReadFile = vi.mocked(readFile);

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
