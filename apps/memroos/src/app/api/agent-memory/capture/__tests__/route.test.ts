// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAgentHeaders: vi.fn(),
  authorizeRegistryWrite: vi.fn(),
  captureCodingAgentSession: vi.fn(),
  checkAuthRateLimit: vi.fn(),
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/agent/registry", () => ({
  authenticateAgentHeaders: mocks.authenticateAgentHeaders,
}));
vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: mocks.authorizeRegistryWrite,
  registryWriteUnauthorizedResponse: () =>
    Response.json({ ok: false, error: "Registry write authorization required" }, { status: 403 }),
}));
vi.mock("@/lib/agent/memory-continuity", () => ({
  captureCodingAgentSession: mocks.captureCodingAgentSession,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkAuthRateLimit: mocks.checkAuthRateLimit,
}));
vi.mock("@/lib/cron-health", () => ({
  recordCronHealthRun: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

import { POST } from "../route";

const ownAgent = {
  id: "agent-a",
  platform: "codex",
  capabilities: [],
};

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://memroos.example/api/agent-memory/capture", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("capture route agent-key boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAgentHeaders.mockReturnValue(ownAgent);
    mocks.authorizeRegistryWrite.mockReturnValue(false);
    mocks.checkAuthRateLimit.mockReturnValue(null);
    mocks.captureCodingAgentSession.mockReturnValue({ duplicate: false, sourceAgentId: "agent-a" });
  });

  it("allows an agent key to capture its own session and downgrades full depth", async () => {
    const response = await POST(
      request(
        {
          sourceAgentId: "agent-a",
          runtime: "codex",
          sessionId: "session-a",
          captureDepth: "full",
          summary: "Own session",
        },
        { authorization: "Bearer ak_agent-a_test" }
      )
    );

    expect(response.status).toBe(201);
    expect(mocks.captureCodingAgentSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceAgentId: "agent-a", captureDepth: "relevant" })
    );
    expect(mocks.checkAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "memory-capture-agent:agent-a",
      30
    );
  });

  it("refuses an agent key when the payload names another agent", async () => {
    const response = await POST(
      request(
        {
          sourceAgentId: "agent-b",
          runtime: "codex",
          sessionId: "session-b",
        },
        { authorization: "Bearer ak_agent-a_test" }
      )
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "AGENT_CAPTURE_SCOPE_DENIED" });
    expect(mocks.captureCodingAgentSession).not.toHaveBeenCalled();
  });

  it("does not let an invalid agent-shaped key fall through to loopback operator auth", async () => {
    mocks.authenticateAgentHeaders.mockReturnValue(null);
    mocks.authorizeRegistryWrite.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/agent-memory/capture", {
        method: "POST",
        headers: { authorization: "Bearer ak_invalid" },
        body: JSON.stringify({ sourceAgentId: "agent-a", runtime: "codex", sessionId: "session-a" }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.authorizeRegistryWrite).not.toHaveBeenCalled();
  });

  it("retains full depth for the operator sidecar path", async () => {
    mocks.authenticateAgentHeaders.mockReturnValue(null);
    mocks.authorizeRegistryWrite.mockReturnValue(true);

    const response = await POST(
      request(
        {
          sourceAgentId: "sidecar",
          runtime: "other",
          sessionId: "sidecar-session",
          captureDepth: "full",
        },
        { "x-memroos-operator-key": "operator" }
      )
    );

    expect(response.status).toBe(201);
    expect(mocks.captureCodingAgentSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ captureDepth: "full" })
    );
  });
});
