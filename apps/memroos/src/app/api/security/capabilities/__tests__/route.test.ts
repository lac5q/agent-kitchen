// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RegisteredAgent } from "@/types";

const state = vi.hoisted(() => ({
  agents: [] as RegisteredAgent[],
}));

vi.mock("@/lib/agent-registry", () => ({
  listRegisteredAgents: () => state.agents,
  listAllAgentsUnscoped: () => state.agents,
}));

const { GET } = await import("../route");

function agent(overrides: Partial<RegisteredAgent>): RegisteredAgent {
  return {
    id: "agent-a",
    name: "Agent A",
    role: "Engineer",
    platform: "codex",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deregisteredAt: null,
    ...overrides,
  };
}

describe("GET /api/security/capabilities", () => {
  beforeEach(() => {
    state.agents = [];
  });

  it("returns security mode coverage for registered agents", async () => {
    state.agents = [
      agent({
        id: "agent-a",
        metadata: { securityMode: "strict" },
        capabilities: [
          { id: "agent-shield", name: "Agent Shield", description: "Policy defense", tags: ["security"] },
        ],
      }),
      agent({ id: "agent-b", status: "dormant" }),
    ];

    const res = await GET();
    const data = await res.json();

    expect(data.summary.totalAgents).toBe(2);
    expect(data.summary.strictAgents).toBe(1);
    expect(data.agents[0].securityCapabilities).toContain("agent-shield");
    expect(data.policies.dispatchPolicy).toBe("enforced");
  });
});
