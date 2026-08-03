// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-registry", () => ({
  getRemoteAgents: vi.fn(),
  listAllAgentsUnscoped: vi.fn(),
}));
vi.mock("@/lib/dispatch/adapter-factory", () => ({
  selectAdapter: vi.fn(),
}));
vi.mock("@/app/api/chat/chat-runtime", () => ({
  buildAgentContext: vi.fn(async (agentId: string) => ({
    systemPrompt: "test",
    source: agentId === "qwen-engineer" ? "knowledge" : "pmo",
    dir: null,
    agentInstructions: null,
  })),
  chatRuntimeStatus: vi.fn((runtime: { runner: string; model: string }) => {
    if (runtime.runner === "opencode") {
      return {
        status: "blocked",
        detail: "OpenCode runner is disabled. Set MEMROOS_ENABLE_OPENCODE=true for live chat.",
      };
    }
    return {
      status: "ready",
      detail: "Anthropic chat is configured. Provider quota can still reject a live response.",
    };
  }),
  resolveChatRuntimePlan: vi.fn(async (agentId: string) => {
    if (agentId === "qwen-engineer") {
      return {
        primary: { runner: "opencode", model: "bailian/qwen3.5-plus", source: "registered-platform", detail: "registered platform" },
        candidates: [{ runner: "opencode", model: "bailian/qwen3.5-plus", source: "registered-platform", detail: "registered platform" }],
      };
    }
    return {
      primary: { runner: "opencode", model: "bailian/qwen3.5-plus", source: "pmo-routing", detail: "PMO routing default" },
      candidates: [
        { runner: "opencode", model: "bailian/qwen3.5-plus", source: "pmo-routing", detail: "PMO routing default" },
        { runner: "anthropic", model: "claude-sonnet-4-6", source: "registered-platform", detail: "registered platform" },
      ],
    };
  }),
}));

const { POST } = await import("../route");
const { getRemoteAgents, listAllAgentsUnscoped } = await import("@/lib/agent-registry");
const { selectAdapter } = await import("@/lib/dispatch/adapter-factory");

const mockGetRemoteAgents = vi.mocked(getRemoteAgents);
const mockListRegisteredAgents = vi.mocked(listAllAgentsUnscoped);
const mockSelectAdapter = vi.mocked(selectAdapter);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ELEVENLABS_API_KEY", "voice-key");
  vi.stubEnv("MEMROOS_ENABLE_OPENCODE", "false");
  mockSelectAdapter.mockReturnValue({
    name: "hive-poll",
    platform: ["claude"],
    dispatch: vi.fn(),
  } as any);
  mockGetRemoteAgents.mockReturnValue([]);
  mockListRegisteredAgents.mockReturnValue([
    {
      id: "claude-sonnet-engineer",
      name: "Claude Sonnet Engineer",
      role: "CLI engineer",
      platform: "claude",
      protocol: "local",
      status: "active",
      lastHeartbeat: null,
      currentTask: null,
      lessonsCount: 0,
      todayMemoryCount: 0,
      location: "local",
      isRemote: false,
      latencyMs: null,
      capabilities: [],
      metadata: {},
      host: null,
      port: null,
      healthEndpoint: null,
      tunnelUrl: null,
      createdAt: "2026-05-11T00:00:00Z",
      updatedAt: "2026-05-11T00:00:00Z",
      deregisteredAt: null,
    },
    {
      id: "qwen-engineer",
      name: "Qwen Engineer",
      role: "Qwen CLI engineer",
      platform: "qwen",
      protocol: "local",
      status: "dormant",
      lastHeartbeat: null,
      currentTask: null,
      lessonsCount: 0,
      todayMemoryCount: 0,
      location: "local",
      isRemote: false,
      latencyMs: null,
      capabilities: [],
      metadata: {},
      host: null,
      port: null,
      healthEndpoint: null,
      tunnelUrl: null,
      createdAt: "2026-05-11T00:00:00Z",
      updatedAt: "2026-05-11T00:00:00Z",
      deregisteredAt: null,
    },
  ]);
});

function makeRequest(body: object) {
  return { json: async () => body } as Request;
}

describe("POST /api/engagement/test", () => {
  it("returns chat, dispatch, and voice diagnostics for selected agents", async () => {
    const res = await POST(makeRequest({ agentIds: ["claude-sonnet-engineer"] }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      agentId: "claude-sonnet-engineer",
      chat: {
        status: "warning",
        runner: "opencode",
        model: "bailian/qwen3.5-plus",
        source: "pmo-routing",
        fallbackRunner: "anthropic",
      },
      dispatch: { status: "ready", adapter: "hive-poll" },
      voice: { status: "ready" },
    });
  });

  it("marks OpenCode chat blocked when the runner is disabled", async () => {
    const res = await POST(makeRequest({ agentIds: ["qwen-engineer"] }) as any);
    const body = await res.json();

    expect(body.results[0]).toMatchObject({
      agentId: "qwen-engineer",
      chat: { status: "blocked", runner: "opencode", model: "bailian/qwen3.5-plus" },
    });
  });
});
