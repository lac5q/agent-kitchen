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

describe("GET /api/security/capabilities truthful envelopes", () => {
  beforeEach(() => {
    state.agents = [];
  });

  it("returns empty envelopes when no agents are registered", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.summary.metrics.totalAgents).toMatchObject({
      value: null,
      status: "empty",
      reason: expect.stringMatching(/no agents are registered/i),
    });
    expect(data.summary.metrics.strictAgents).toMatchObject({
      value: null,
      status: "empty",
    });
    expect(data.summary.metrics.standardAgents).toMatchObject({
      value: null,
      status: "empty",
    });
    expect(data.summary.metrics.permissiveAgents).toMatchObject({
      value: null,
      status: "empty",
    });
    expect(data.summary.metrics.agentsWithSecurityCapabilities).toMatchObject({
      value: null,
      status: "empty",
    });
    expect(data.policies.metric).toMatchObject({
      status: "live",
      source: expect.stringContaining("MEMROOS_SECURITY_MODE"),
    });
  });

  it("returns empty envelope for total agents when registry is empty", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.summary.metrics.totalAgents).toMatchObject({
      value: null,
      status: "empty",
    });
  });

  it("returns live counts when agents exist", async () => {
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
    const data = await (await GET()).json();
    expect(data.summary.metrics.totalAgents).toMatchObject({
      value: 2,
      status: "live",
      source: "sqlite://registered_agents",
    });
    expect(data.summary.metrics.strictAgents).toMatchObject({ value: 1, status: "live" });
    expect(data.summary.metrics.standardAgents).toMatchObject({ value: 1, status: "live" });
    expect(data.summary.metrics.agentsWithSecurityCapabilities).toMatchObject({
      value: 1,
      status: "live",
    });
  });

  it("includes liveness observation per agent", async () => {
    state.agents = [
      agent({ id: "agent-a", lastHeartbeat: null }),
      agent({
        id: "agent-b",
        lastHeartbeat: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    const data = await (await GET()).json();
    const a = data.agents.find((ag: { id: string }) => ag.id === "agent-a");
    const b = data.agents.find((ag: { id: string }) => ag.id === "agent-b");
    expect(a.liveness).toMatchObject({ state: "never", observedAt: null });
    expect(b.liveness).toMatchObject({ state: "stale", reason: expect.stringMatching(/14400s old/) });
  });

  it("preserves scalar summary fields for backward compatibility", async () => {
    state.agents = [
      agent({
        id: "agent-a",
        metadata: { securityMode: "strict" },
      }),
    ];
    const data = await (await GET()).json();
    expect(data.summary.totalAgents).toBe(1);
    expect(data.summary.strictAgents).toBe(1);
    expect(data.summary.standardAgents).toBe(0);
    expect(data.summary.permissiveAgents).toBe(0);
    expect(data.summary.agentsWithSecurityCapabilities).toBe(0);
    expect(data.summary.metrics).toBeDefined();
  });
});
