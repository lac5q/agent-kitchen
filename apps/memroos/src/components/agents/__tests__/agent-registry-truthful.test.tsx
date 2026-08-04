import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredAgent } from "@/types";
import type { LivenessObservation } from "@/lib/agent/liveness";

const mutateRegister = vi.fn();
const mutateRegisterA2a = vi.fn();
const mutateDeregister = vi.fn();
const mutateInvite = vi.fn();

const mockUseRegisteredAgents = vi.fn();
const mockUseSecurityCapabilities = vi.fn();

vi.mock("@/lib/api-client", () => ({
  useRegisteredAgents: () => mockUseRegisteredAgents(),
  useSecurityCapabilities: () => mockUseSecurityCapabilities(),
  useRegisterAgentMutation: vi.fn(() => ({ mutate: mutateRegister, isPending: false })),
  useRegisterA2aAgentCardMutation: vi.fn(() => ({ mutate: mutateRegisterA2a, isPending: false })),
  useCreateAgentOnboardingInviteMutation: vi.fn(() => ({ mutate: mutateInvite, isPending: false })),
  useDeregisterAgentMutation: vi.fn(() => ({ mutate: mutateDeregister, isPending: false })),
  useDeleteAgentMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import AgentRegistryPage from "@/app/agents/page";

const baseAgent = (overrides: Partial<RegisteredAgent>): RegisteredAgent => ({
  id: "agent-a",
  name: "Agent A",
  role: "Engineer",
  platform: "codex",
  protocol: "rest",
  status: "active",
  lastHeartbeat: "2026-07-15T12:00:00.000Z",
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
});

const liveObservation: LivenessObservation = {
  state: "live",
  observedAt: "2026-07-15T12:00:00.000Z",
  freshnessMs: 1000,
  source: "sqlite://registered_agents.last_heartbeat_at",
  reason: "fresh heartbeat",
};

const staleObservation: LivenessObservation = {
  state: "stale",
  observedAt: "2026-07-15T08:00:00.000Z",
  freshnessMs: 4 * 60 * 60 * 1000,
  source: "sqlite://registered_agents.last_heartbeat_at",
  reason: "Latest observation is 14400s old, threshold is 1800s",
};

const neverObservation: LivenessObservation = {
  state: "never",
  observedAt: null,
  freshnessMs: null,
  source: "sqlite://registered_agents.last_heartbeat_at",
  reason: "Agent has never produced a heartbeat, hive action, or local-runtime observation",
};

const emptyEnvelope = {
  value: null,
  status: "empty" as const,
  source: "sqlite://registered_agents",
  observedAt: null,
  freshnessMs: null,
  scope: { window: "lifetime", workspace: "all" },
  reason: "No agents are registered; liveness aggregate is empty, not zero",
};

const liveEnvelope = (value: number, source: string, reason: string) => ({
  value,
  status: "live" as const,
  source,
  observedAt: "2026-07-15T12:00:00.000Z",
  freshnessMs: 1000,
  scope: { window: "lifetime", workspace: "all" },
  reason,
});

const zeroEnvelope = (value: number, source: string, reason: string) => ({
  value,
  status: "zero" as const,
  source,
  observedAt: "2026-07-15T12:00:00.000Z",
  freshnessMs: 1000,
  scope: { window: "lifetime", workspace: "all" },
  reason,
});

function setupAgentsResponse(agents: (RegisteredAgent & { liveness: LivenessObservation })[]) {
  mockUseRegisteredAgents.mockReturnValue({
    data: {
      agents,
      summary: {
        total: liveEnvelope(agents.length, "sqlite://registered_agents", `${agents.length} registered agents`),
        active: liveEnvelope(
          agents.filter((a) => a.status === "active").length,
          "sqlite://registered_agents.status",
          `${agents.filter((a) => a.status === "active").length} of ${agents.length} agents report status=active`,
        ),
        idle: zeroEnvelope(0, "sqlite://registered_agents.status", "No agents currently report status=idle"),
        dormant: zeroEnvelope(0, "sqlite://registered_agents.status", "No agents currently report status=dormant"),
        error: zeroEnvelope(0, "sqlite://registered_agents.status", "No agents currently report status=error"),
      },
      liveness: liveEnvelope(
        agents.filter((a) => a.liveness.state === "live").length,
        "sqlite://registered_agents",
        `${agents.filter((a) => a.liveness.state === "live").length} live agents`,
      ),
      readiness: {
        average: liveEnvelope(55, "computed://registered_agents.readiness", "average readiness"),
        withCapabilities: liveEnvelope(agents.length, "computed://registered_agents.readiness", "with-capabilities count"),
      },
      protocols: {
        rest: liveEnvelope(agents.filter((a) => a.protocol === "rest").length, "sqlite://registered_agents.protocol", "rest-protocol agents"),
        a2a: zeroEnvelope(0, "sqlite://registered_agents.protocol", "No a2a-protocol agents"),
        ui: zeroEnvelope(0, "sqlite://registered_agents.protocol", "No ui-protocol agents"),
        local: zeroEnvelope(0, "sqlite://registered_agents.protocol", "No local-protocol agents"),
      },
      localRuntime: {
        ok: true,
        metric: liveEnvelope(0, "host://local-agent-runtime.scan", "0 active CLI sessions across 0 platforms"),
      },
      timestamp: "2026-07-15T12:00:00.000Z",
    },
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof mockUseRegisteredAgents>);
}

function setupEmptyAgentsResponse() {
  mockUseRegisteredAgents.mockReturnValue({
    data: {
      agents: [],
      summary: {
        total: emptyEnvelope,
        active: emptyEnvelope,
        idle: emptyEnvelope,
        dormant: emptyEnvelope,
        error: emptyEnvelope,
      },
      liveness: emptyEnvelope,
      readiness: {
        average: emptyEnvelope,
        withCapabilities: emptyEnvelope,
      },
      protocols: {
        rest: emptyEnvelope,
        a2a: emptyEnvelope,
        ui: emptyEnvelope,
        local: emptyEnvelope,
      },
      localRuntime: {
        ok: true,
        metric: liveEnvelope(0, "host://local-agent-runtime.scan", "0 active CLI sessions across 0 platforms"),
      },
      timestamp: "2026-07-15T12:00:00.000Z",
    },
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof mockUseRegisteredAgents>);
}

mockUseSecurityCapabilities.mockReturnValue({
  data: {
    summary: {
      totalAgents: 0,
      strictAgents: 0,
      standardAgents: 0,
      permissiveAgents: 0,
      agentsWithSecurityCapabilities: 0,
      metrics: {
        totalAgents: emptyEnvelope,
        strictAgents: emptyEnvelope,
        standardAgents: emptyEnvelope,
        permissiveAgents: emptyEnvelope,
        agentsWithSecurityCapabilities: emptyEnvelope,
      },
    },
    policies: {
      defaultMode: "standard",
      dispatchPolicy: "enforced",
      a2aPolicy: "enforced",
      memoryWritePolicy: "enforced",
      metric: liveEnvelope(1, "env://MEMROOS_SECURITY_MODE=standard", "policies enforced"),
    },
    agents: [],
    timestamp: "2026-07-15T12:00:00.000Z",
  },
  isLoading: false,
  isError: false,
  error: null,
});

describe("AgentRegistryPage truthful rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyAgentsResponse();
  });

  it("renders empty-state messaging when no agents are registered", () => {
    render(<AgentRegistryPage />);
    expect(screen.getAllByText(/No registered agents yet\./).length).toBeGreaterThan(0);
    expect(screen.getByText(/Register an agent above/)).toBeInTheDocument();
  });

  it("distinguishes no agents in registry from no match against filter", async () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "live-1", name: "Live Agent" }), liveness: liveObservation },
    ]);
    const { rerender } = render(<AgentRegistryPage />);
    // The page-level "No registered agents yet." is inside the table; the
    // security panel still renders the same wording, so we look inside the
    // table specifically via data-status-block.
    expect(document.querySelector('[data-status-block="empty-agents"]')).toBeNull();
    expect(screen.queryByText(/No registered agents match this view\./)).not.toBeInTheDocument();

    // Switch to a liveness filter that excludes the only agent.
    const staleButton = screen.getAllByRole("button", { name: /^stale$/ })[0]!;
    fireEvent.click(staleButton);
    await waitFor(() => {
      expect(screen.getByText(/No registered agents match this view\./)).toBeInTheDocument();
    });
    expect(screen.getByText(/Adjust the protocol, status, or liveness filters/)).toBeInTheDocument();
    rerender(<AgentRegistryPage />);
  });

  it("renders live, stale, and never liveness badges distinctly in the table", () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "live-1", status: "active" }), liveness: liveObservation },
      { ...baseAgent({ id: "stale-1", status: "dormant" }), liveness: staleObservation },
      { ...baseAgent({ id: "never-1", status: "dormant" }), liveness: neverObservation },
    ]);
    render(<AgentRegistryPage />);
    expect(screen.getAllByText(/^live$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^stale$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^never$/i).length).toBeGreaterThan(0);
  });

  it("exposes a liveness filter that filters rows by liveness state", async () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "live-1", name: "Live Agent", status: "active" }), liveness: liveObservation },
      { ...baseAgent({ id: "stale-1", name: "Stale Agent", status: "dormant" }), liveness: staleObservation },
      { ...baseAgent({ id: "never-1", name: "Never Agent", status: "dormant" }), liveness: neverObservation },
    ]);
    render(<AgentRegistryPage />);
    expect(screen.getByText("Live Agent")).toBeInTheDocument();
    const staleButton = screen.getAllByRole("button", { name: /^stale$/ })[0]!;
    fireEvent.click(staleButton);
    await waitFor(() => {
      const staleRow = document.querySelector('[data-agent-id="stale-1"]');
      expect(staleRow).toBeTruthy();
      const liveRow = document.querySelector('[data-agent-id="live-1"]');
      expect(liveRow).toBeNull();
    });
  });

  it("exposes source/observedAt/scope/reason for the liveness banner", () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "live-1", name: "Live Agent", status: "active" }), liveness: liveObservation },
      { ...baseAgent({ id: "stale-1", name: "Stale Agent", status: "dormant" }), liveness: staleObservation },
    ]);
    render(<AgentRegistryPage />);
    const banner = screen.getByTestId("agents-liveness-banner");
    expect(banner.getAttribute("data-liveness-status")).toBeTruthy();
    expect(banner.textContent).toMatch(/Liveness:/);
  });

  it("renders agents with no active rows when none are live", () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "stale-1", name: "Stale Agent", status: "dormant" }), liveness: staleObservation },
      { ...baseAgent({ id: "never-1", name: "Never Agent", status: "dormant" }), liveness: neverObservation },
    ]);
    render(<AgentRegistryPage />);
    expect(screen.getByText("Stale Agent")).toBeInTheDocument();
    expect(screen.getByText("Never Agent")).toBeInTheDocument();
    expect(screen.getAllByText(/^stale$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^never$/i).length).toBeGreaterThan(0);
  });

  it("shows the detail drawer liveness source and reason", async () => {
    setupAgentsResponse([
      { ...baseAgent({ id: "live-1", name: "Live Agent", status: "active" }), liveness: liveObservation },
    ]);
    render(<AgentRegistryPage />);
    fireEvent.click(screen.getByText("Live Agent"));
    await waitFor(() => {
      const source = document.querySelector('[data-liveness-source]');
      const reason = document.querySelector('[data-liveness-reason]');
      expect(source).toBeTruthy();
      expect(reason).toBeTruthy();
    }, { timeout: 3000 });
    const source = document.querySelector('[data-liveness-source]')!;
    const reason = document.querySelector('[data-liveness-reason]')!;
    expect(source.textContent).toMatch(/source=sqlite:\/\/registered_agents\.last_heartbeat_at/);
    expect(reason.textContent).toMatch(/fresh heartbeat/);
  });
});
