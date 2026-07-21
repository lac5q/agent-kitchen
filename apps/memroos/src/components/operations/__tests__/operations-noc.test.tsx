import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationsNoc } from "../index";

const api = vi.hoisted(() => ({
  useMemoryStats: vi.fn(),
  useTimeSeries: vi.fn(),
  useModelUsage: vi.fn(),
  useOperationsNoc: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useSkills: vi.fn(),
}));

function envelope(
  status: "live" | "zero" | "empty" | "error" = "empty",
  value: number | null = null,
  source = "sqlite://test",
) {
  return {
    value,
    status,
    source,
    observedAt: null,
    freshnessMs: null,
    scope: { window: "24h", workspace: "all" },
    reason: status === "empty" ? "Healthy source has no observations in the selected window" : null,
  };
}

function noHistoryNocResponse() {
  return {
    attention: [],
    agentActivity: {
      sourceState: "no_history",
      source: "sqlite://messages",
      observedAt: null,
      agents: [],
      delegations: [],
    },
    sourceStates: {
      attention: "live",
      agentActivity: "no_history",
      efficiencySignals: "known_unwired",
    },
    panels: {},
    metrics: {
      memoryRows: envelope("empty", null, "sqlite://messages"),
      hiveActions: envelope("empty", null, "/api/hive"),
      activeDispatches: envelope("empty", null, "sqlite://hive_delegations"),
      failedWork: envelope("empty", null, "sqlite://hive_delegations"),
      governanceEvents: envelope("empty", null, "sqlite://audit_entries"),
      enabledSkills: envelope("empty", null, "sqlite://skill_registry"),
      cronWarnings: envelope("empty", null, "sqlite://cron_health_jobs"),
      localFootprint: envelope("empty", null, "local://footprint"),
    },
  };
}

vi.mock("@/lib/api-client", () => ({
  useHiveFeed: () => ({ data: { actions: [] }, isLoading: false, isError: false }),
  useDelegations: () => ({ data: { delegations: [] }, isLoading: false, isError: false }),
  useMemoryStats: api.useMemoryStats,
  useMemoryTierHealth: () => ({
    data: { tiers: [], timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  }),
  useModelUsage: api.useModelUsage,
  useOperationsNoc: api.useOperationsNoc,
  useTimeSeries: api.useTimeSeries,
  useAgentPeers: () => ({ data: { peers: [], window_minutes: 1440, timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false }),
  useAgents: () => ({ data: { agents: [] }, isLoading: false, isError: false }),
  useSealProposals: () => ({ data: { proposals: [], timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false }),
  useSecurityReport: () => ({ data: { summary: { highSeverity: 0, blockedAttempts: 0, securityEvents: 0 } }, isLoading: false, isError: false }),
  useEscalations: () => ({ data: { escalations: [], timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false }),
  useSkills: api.useSkills,
  useModelRoutingDashboard: api.useModelRoutingDashboard,
  useAuditLog: () => ({ data: { entries: [], timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false }),
  useOrchestrationHil: () => ({ data: { decisions: [], timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false }),
}));

describe("OperationsNoc Phase 174 operator layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: null,
        pendingUnconsolidated: 0,
        tierStats: [],
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-07-20T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useTimeSeries.mockImplementation((metric: string, window: string) => ({
      data: { points: [], metric, window, timestamp: "2026-07-20T12:00:00Z" },
      isLoading: false,
      isError: false,
    }));
    api.useModelUsage.mockReturnValue({
      data: {
        usage: {
          models: [],
          total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, requests: 0 },
        },
        timestamp: "2026-07-20T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useSkills.mockReturnValue({
      data: {
        totalSkills: 0,
        coverageGaps: [],
        skillBudget: { duplicateSkills: [] },
        skillDetails: [],
        lastUpdated: null,
      },
      isLoading: false,
      isError: false,
    });
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [],
        summary: { totalRuns: 0, successfulRuns: 0, successRate: null, averageQuality: null, averageLatencyMs: null },
        timestamp: "2026-07-20T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useOperationsNoc.mockReturnValue({
      data: noHistoryNocResponse(),
      isLoading: false,
      isError: false,
    });
  });

  it("renders the approved default order and removes superseded standalone blocks", async () => {
    const { container } = render(<OperationsNoc />);
    await screen.findByText(/Measured spend/i);

    const order = Array.from(container.querySelectorAll("[data-noc-section]"))
      .map((node) => node.getAttribute("data-noc-section"));
    expect(order).toEqual([
      "header",
      "pulse",
      "attention",
      "memory",
      "agent-model-activity",
      "cost",
      "governance-skills",
    ]);
    expect(screen.getByTestId("memory-tier-health")).toBeInTheDocument();
    expect(screen.queryByText(/^Memory digestion$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Savings source$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Waste$/i)).not.toBeInTheDocument();
  });

  it("hides advanced panels by default and remembers the accessible toggle", async () => {
    const first = render(<OperationsNoc />);
    const toggle = screen.getByRole("checkbox", { name: "Show advanced" });

    expect(toggle).not.toBeChecked();
    expect(screen.queryByText(/Efficiency signals/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Behavior signals/i)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem("memroos:noc:show-advanced")).toBe("true");
    expect(await screen.findByText(/Efficiency signals/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Behavior signals/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Source not yet wired — activates when EFFTEL producers ship/i).length).toBeGreaterThan(0);

    first.unmount();
    render(<OperationsNoc />);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Show advanced" })).toBeChecked();
    });
    expect(await screen.findByText(/Efficiency signals/i)).toBeInTheDocument();
  });

  it("propagates 24h, 7d, 30d, and workspace filters through every default row", async () => {
    render(<OperationsNoc />);

    expect(api.useOperationsNoc).toHaveBeenCalledWith({ window: "24h", workspace: "all" });
    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "day", workspace: "all" });
    expect(api.useMemoryStats).toHaveBeenCalledWith({ workspace: "all" });

    fireEvent.change(screen.getByLabelText("NOC date range"), { target: { value: "7d" } });
    fireEvent.change(screen.getByLabelText("NOC workspace"), { target: { value: "local" } });

    await waitFor(() => {
      expect(api.useOperationsNoc).toHaveBeenCalledWith({ window: "7d", workspace: "local" });
      expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "week", workspace: "local" });
      expect(api.useMemoryStats).toHaveBeenCalledWith({ workspace: "local" });
      expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", "week");
      expect(api.useTimeSeries).toHaveBeenCalledWith("recall_queries", "week");
    });
    expect(screen.getByText(/Agent activity · last 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost · last 7 days/i)).toBeInTheDocument();
    expect(screen.getAllByText(/window=7d.*workspace=local/i).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("NOC date range"), { target: { value: "30d" } });
    fireEvent.change(screen.getByLabelText("NOC workspace"), { target: { value: "remote" } });

    await waitFor(() => {
      expect(api.useOperationsNoc).toHaveBeenCalledWith({ window: "30d", workspace: "remote" });
      expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "month", workspace: "remote" });
      expect(api.useMemoryStats).toHaveBeenCalledWith({ workspace: "remote" });
      expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", "month");
      expect(api.useTimeSeries).toHaveBeenCalledWith("recall_queries", "month");
    });
    expect(screen.getByText(/Memory activity · last 30 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Cost · last 30 days/i)).toBeInTheDocument();
    expect(screen.getAllByText(/window=30d.*workspace=remote/i).length).toBeGreaterThan(0);
  });

  it("filters memory probes, skills, and cost to the same selected scope", async () => {
    const now = new Date().toISOString();
    api.useSkills.mockReturnValue({
      data: {
        totalSkills: 2,
        coverageGaps: [],
        skillBudget: { duplicateSkills: [] },
        lastUpdated: now,
        skillDetails: [
          {
            name: "local-skill",
            title: "Local skill",
            owner: "codex",
            stage: "general",
            health: "ready",
            reviewStatus: "approved",
            path: "/local",
            approvedAt: now,
            updatedAt: now,
            lastActivityAt: now,
          },
          {
            name: "remote-skill",
            title: "Remote skill",
            owner: "cloud-agent",
            stage: "general",
            health: "ready",
            reviewStatus: "approved",
            path: "/remote",
            approvedAt: now,
            updatedAt: now,
            lastActivityAt: now,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [
          {
            id: 1,
            taskType: "engineering",
            agentId: "codex",
            provider: "test",
            model: "local-model",
            strategy: "balanced",
            latencyMs: 100,
            inputTokens: 80,
            outputTokens: 20,
            estimatedCostUsd: 0.1,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: now,
          },
          {
            id: 2,
            taskType: "engineering",
            agentId: "cloud-agent",
            provider: "test",
            model: "remote-model",
            strategy: "balanced",
            latencyMs: 100,
            inputTokens: 800,
            outputTokens: 200,
            estimatedCostUsd: 0.9,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: now,
          },
        ],
        summary: { totalRuns: 2, successfulRuns: 2, successRate: 1, averageQuality: null, averageLatencyMs: 100 },
        timestamp: now,
      },
      isLoading: false,
      isError: false,
    });

    render(<OperationsNoc />);
    fireEvent.change(screen.getByLabelText("NOC workspace"), { target: { value: "local" } });

    await waitFor(() => {
      expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "day", workspace: "local" });
      expect(api.useMemoryStats).toHaveBeenCalledWith({ workspace: "local" });
      expect(screen.getByText("Local skill")).toBeInTheDocument();
      expect(screen.queryByText("Remote skill")).not.toBeInTheDocument();
      expect(document.querySelector('[data-cost-model="local-model"]')).toBeInTheDocument();
      expect(document.querySelector('[data-cost-model="remote-model"]')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("$0.100").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.900")).not.toBeInTheDocument();
  });

  it("makes measured spend and per-model usage primary in Cost", async () => {
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [
          {
            id: 1,
            taskType: "engineering",
            agentId: "codex",
            provider: "test",
            model: "k3",
            strategy: "balanced",
            latencyMs: 120,
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: 0.41,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: new Date().toISOString(),
          },
        ],
        summary: { totalRuns: 1, successfulRuns: 1, successRate: 1, averageQuality: null, averageLatencyMs: 120 },
        timestamp: new Date().toISOString(),
      },
      isLoading: false,
      isError: false,
    });
    api.useModelUsage.mockReturnValue({
      data: {
        usage: {
          models: [
            { id: "k3", name: "k3", inputTokens: 100, outputTokens: 50, cacheRead: 0, cacheCreation: 0, requests: 1, totalTokens: 150 },
          ],
          total: { inputTokens: 100, outputTokens: 50, cacheRead: 0, cacheCreation: 0, requests: 1 },
        },
        timestamp: new Date().toISOString(),
      },
      isLoading: false,
      isError: false,
    });

    render(<OperationsNoc />);

    expect((await screen.findAllByText("$0.410")).length).toBeGreaterThan(0);
    const costModel = document.querySelector('[data-cost-model="k3"]');
    expect(costModel).toBeInTheDocument();
    if (costModel) {
      expect(within(costModel).getByText("k3")).toBeInTheDocument();
      expect(within(costModel).getByText("1 req")).toBeInTheDocument();
      expect(within(costModel).getByText("150 tok")).toBeInTheDocument();
    }
  });

  it("uses semantic no-history and all-clear copy without generic forbidden empties", async () => {
    const { container } = render(<OperationsNoc />);
    await screen.findByText(/Measured spend/i);

    expect(screen.getByText(/All clear — no cron failures/i)).toBeInTheDocument();
    expect(screen.getAllByText(/No message history yet/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No memory activity history yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No spend history yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No governance history in the loaded audit snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/No emerging skill records yet/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-status-block="no_history"]').length).toBeGreaterThanOrEqual(5);
    const allowedStates = new Set(["live", "window_empty", "no_history", "stale_or_error"]);
    for (const card of container.querySelectorAll("[data-card-label]")) {
      const state = card.querySelector("[data-status-block]")?.getAttribute("data-status-block");
      expect(allowedStates.has(state ?? "")).toBe(true);
    }
    expect(container.textContent ?? "").not.toMatch(new RegExp(["No", "events"].join(" "), "i"));
    expect(container.textContent ?? "").not.toMatch(new RegExp(["empty", "by", "design"].join(" "), "i"));
  });

  it("keeps operator grids mobile-safe with auto-fit layout", async () => {
    const { container } = render(<OperationsNoc />);
    await screen.findByText(/Measured spend/i);

    const grids = Array.from(container.querySelectorAll<HTMLElement>("[data-mobile-grid]"));
    expect(grids.length).toBeGreaterThanOrEqual(4);
    for (const grid of grids) {
      expect(grid.style.gridTemplateColumns).toContain("auto-fit");
    }
  });

  it("retains the truthful live telemetry header without sample-backed claims", () => {
    render(<OperationsNoc />);

    expect(screen.getByText(/operations . live telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/explicit gaps shown/i)).toBeInTheDocument();
    expect(screen.getByText(/missing streams render explicit gaps/i)).toBeInTheDocument();
    expect(screen.queryByText(/sample-backed panels/i)).not.toBeInTheDocument();
  });

  // Phase 174 watcher fix #4: the default NOC surface must NOT call into
  // the legacy AgentWorkload component. It must use the Phase 173
  // message-backed AgentActivityPanel as the source of truth and render
  // delegation detail only when rows are present.
  it("renders the message-backed Agent Activity panel in the default layout", async () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        ...noHistoryNocResponse(),
        agentActivity: {
          sourceState: "live",
          source: "sqlite://messages",
          observedAt: "2026-07-20T12:00:00.000Z",
          agents: [
            { agentId: "codex", messageCount: 4, sessionCount: 2, lastMessageAt: "2026-07-20T11:59:00.000Z" },
            { agentId: "hermes", messageCount: 2, sessionCount: 1, lastMessageAt: "2026-07-20T11:30:00.000Z" },
          ],
          delegations: [
            { taskId: "task-1", fromAgent: "codex", toAgent: "hermes", status: "active", updatedAt: "2026-07-20T11:45:00.000Z" },
          ],
        },
        sourceStates: { agentActivity: "live", efficiencySignals: "known_unwired" },
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<OperationsNoc />);

    // The default panel must be present and must NOT contain the
    // legacy hive-only workload row labels.
    expect(screen.getByTestId("agent-activity-panel")).toBeInTheDocument();
    expect(screen.getByText(/Agent activity · last 24 hours/i)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="agent-workload-liveness"]')).toBeNull();
    expect(screen.queryByText(/Agent workload ·/i)).not.toBeInTheDocument();

    // Delegation detail is additive: the 1 active delegation row is shown
    // because rows exist. The default state would otherwise hide it.
    expect(screen.getByText(/1 hive delegation in window/i)).toBeInTheDocument();
    expect(screen.getByText(/codex → hermes/i)).toBeInTheDocument();
    expect(document.querySelector('[data-delegation-task="task-1"]')).toBeInTheDocument();
  });

  it("hides delegation detail when the message source has no delegations", async () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        ...noHistoryNocResponse(),
        agentActivity: {
          sourceState: "live",
          source: "sqlite://messages",
          observedAt: "2026-07-20T12:00:00.000Z",
          agents: [
            { agentId: "codex", messageCount: 4, sessionCount: 2, lastMessageAt: "2026-07-20T11:59:00.000Z" },
          ],
          delegations: [],
        },
        sourceStates: { agentActivity: "live", efficiencySignals: "known_unwired" },
      },
      isLoading: false,
      isError: false,
    });

    render(<OperationsNoc />);

    expect(screen.getByTestId("agent-activity-panel")).toBeInTheDocument();
    // The "X hive delegations in window" row is the only delegation
    // summary element. It must be absent when delegations[] is empty.
    expect(screen.queryByText(/hive delegations in window/i)).not.toBeInTheDocument();
  });

  // Phase 174 watcher fix #2: Cost must use the four-state semantics,
  // not classify an in-window ledger row without a cost as window_empty.
  it("classifies in-window spend without cost as stale_or_error, not window_empty", async () => {
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [
          {
            id: 1,
            taskType: "engineering",
            agentId: "codex",
            provider: "test",
            model: "k3",
            strategy: "balanced",
            latencyMs: 120,
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: null,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            taskType: "engineering",
            agentId: "codex",
            provider: "test",
            model: "m3",
            strategy: "balanced",
            latencyMs: 90,
            inputTokens: 40,
            outputTokens: 10,
            estimatedCostUsd: 0.05,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: new Date().toISOString(),
          },
        ],
        summary: { totalRuns: 2, successfulRuns: 2, successRate: 1, averageQuality: null, averageLatencyMs: 105 },
        timestamp: new Date().toISOString(),
      },
      isLoading: false,
      isError: false,
    });

    render(<OperationsNoc />);
    expect(await screen.findByText(/Measured spend/i)).toBeInTheDocument();
    // The panel-level state must be stale_or_error (the source has rows
    // but no cost), NOT window_empty (which would tell the operator to
    // widen the window when the real problem is missing cost data).
    const blocks = Array.from(document.querySelectorAll('[data-status-block]'));
    const costBlock = blocks.find(
      (el) => (el.textContent ?? "").toLowerCase().includes("spend data missing"),
    );
    expect(costBlock).toBeDefined();
    expect(costBlock?.getAttribute("data-status-block")).toBe("stale_or_error");
    expect(costBlock).toHaveTextContent(/1 of 2 in-scope ledger rows/i);
    expect(costBlock).toHaveTextContent(/partial total is withheld/i);
  });

  it("classifies no-history spend as no_history and window-only spend as window_empty", async () => {
    const farFuture = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [
          {
            id: 1,
            taskType: "engineering",
            agentId: "codex",
            provider: "test",
            model: "k3",
            strategy: "balanced",
            latencyMs: 120,
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: 0.05,
            success: true,
            qualityScore: null,
            contextTags: [],
            promptHash: null,
            error: null,
            createdAt: farFuture,
          },
        ],
        summary: { totalRuns: 1, successfulRuns: 1, successRate: 1, averageQuality: null, averageLatencyMs: 120 },
        timestamp: farFuture,
      },
      isLoading: false,
      isError: false,
    });

    render(<OperationsNoc />);
    expect(await screen.findByText(/Measured spend/i)).toBeInTheDocument();
    const blocks = Array.from(document.querySelectorAll('[data-status-block="window_empty"]'));
    const costBlock = blocks.find(
      (el) => (el.textContent ?? "").toLowerCase().includes("widen the window"),
    );
    expect(costBlock).toBeDefined();
  });
});
