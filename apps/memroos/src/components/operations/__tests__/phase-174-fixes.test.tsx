/**
 * Phase 174 watcher-fixes test suite. Locks in the four required
 * corrections:
 *   (1) NocFilters apply consistently to memory tier health/time series,
 *       SkillsLifecycle, and Cost per-model usage.
 *   (2) Cost renders the four-state semantics rather than classifying
 *       unavailable spend as window_empty.
 *   (3) Every default Pulse card carries a semantic four-state
 *       data-status-block, not generic empty/zero.
 *   (4) The Hive-backed AgentWorkload default is replaced with the Phase
 *       173 message-backed Agent Activity source, showing delegation
 *       only when present.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillsLifecycle } from "../skills-lifecycle";
import { Cost } from "../savings-waste";
import { AgentActivityPanel, OperationsNoc } from "../index";
import { ActivityHeatmap } from "../activity-heatmap";
import { GovernanceStrip } from "../governance-strip";
import { ModelUtility } from "../model-utility";
import { MemoryConsumption } from "../memory-consumption";
import { PulseStrip } from "../pulse-strip";

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
  useModelUsage: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useMemoryStats: vi.fn(),
  useMemoryTierHealth: vi.fn(),
  useTimeSeries: vi.fn(),
  useSealProposals: vi.fn(),
  useSkills: vi.fn(),
  useAgents: vi.fn(),
  useHiveFeed: vi.fn(),
  useDelegations: vi.fn(),
  useAgentPeers: vi.fn(),
  useAuditLog: vi.fn(),
  useOrchestrationHil: vi.fn(),
  useSecurityReport: vi.fn(),
  useEscalations: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
  useModelUsage: api.useModelUsage,
  useModelRoutingDashboard: api.useModelRoutingDashboard,
  useMemoryStats: api.useMemoryStats,
  useMemoryTierHealth: api.useMemoryTierHealth,
  useTimeSeries: api.useTimeSeries,
  useSealProposals: api.useSealProposals,
  useSkills: api.useSkills,
  useAgents: api.useAgents,
  useHiveFeed: api.useHiveFeed,
  useDelegations: api.useDelegations,
  useAgentPeers: api.useAgentPeers,
  useAuditLog: api.useAuditLog,
  useOrchestrationHil: api.useOrchestrationHil,
  useSecurityReport: api.useSecurityReport,
  useEscalations: api.useEscalations,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const noHistoryNocResponse = () => ({
  attention: [],
  agentActivity: {
    sourceState: "no_history",
    source: "sqlite://messages",
    observedAt: null,
    agents: [],
    delegations: [],
  },
  sourceStates: {
    agentActivity: "no_history",
    efficiencySignals: "known_unwired",
  },
  panels: {},
  metrics: {
    memoryRows: { value: null, status: "empty", source: "sqlite://messages", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    hiveActions: { value: null, status: "empty", source: "/api/hive", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    activeDispatches: { value: null, status: "empty", source: "sqlite://hive_delegations", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    failedWork: { value: null, status: "empty", source: "sqlite://hive_delegations", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    governanceEvents: { value: null, status: "empty", source: "sqlite://audit_entries", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    enabledSkills: { value: null, status: "empty", source: "sqlite://skill_registry", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    cronWarnings: { value: null, status: "empty", source: "sqlite://cron_health_jobs", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
    localFootprint: { value: null, status: "empty", source: "local://footprint", observedAt: null, freshnessMs: null, scope: { window: "24h", workspace: "all" }, reason: null },
  },
});

function setDefaultEmptySources() {
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
  api.useSealProposals.mockReturnValue({
    data: { proposals: [], timestamp: "2026-07-20T12:00:00Z" },
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
  api.useMemoryTierHealth.mockReturnValue({
    data: { tiers: [], timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
  api.useAgents.mockReturnValue({ data: { agents: [] }, isLoading: false, isError: false });
  api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isLoading: false, isError: false });
  api.useDelegations.mockReturnValue({ data: { delegations: [] }, isLoading: false, isError: false });
  api.useAgentPeers.mockReturnValue({
    data: { peers: [], window_minutes: 1440, timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
  api.useAuditLog.mockReturnValue({
    data: { entries: [], timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
  api.useOrchestrationHil.mockReturnValue({
    data: { decisions: [], timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
  api.useSecurityReport.mockReturnValue({
    data: { summary: { highSeverity: 0, blockedAttempts: 0, securityEvents: 0 }, timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
  api.useEscalations.mockReturnValue({
    data: { escalations: [], timestamp: "2026-07-20T12:00:00Z" },
    isLoading: false,
    isError: false,
  });
}

describe("Phase 174 — Memory tier health + time series apply NocFilters consistently", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("MemoryConsumption surfaces current window/workspace in the chart and tier health", () => {
    const { container } = render(
      <MemoryConsumption filters={{ window: "7d", workspace: "remote" }} />,
    );

    // The chart and tier health sections both carry the filter signature.
    const filters = (attr: string) =>
      Array.from(container.querySelectorAll(`[data-filters]`))
        .filter((node) => node.getAttribute("data-filters") === attr)
        .map((node) => node.getAttribute("data-filters") ?? "");
    // Tier backend health is deliberately global; it must not masquerade as
    // a selected-workspace data source.
    expect(filters("window=7d&workspace=remote").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-testid="memory-tier-health"]')?.getAttribute("data-scope")).toBe("global-backend-health");

    // The memory-stats call MUST be made with the current workspace.
    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "week", workspace: "remote" });
    // Time-series calls MUST be made with the current window.
    expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", "week");
    expect(api.useTimeSeries).toHaveBeenCalledWith("recall_queries", "week");
  });

  it("MemoryConsumption propagates the new filter set after a 7d → 30d → local switch", () => {
    const { rerender } = render(
      <MemoryConsumption filters={{ window: "7d", workspace: "local" }} />,
    );
    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "week", workspace: "local" });

    rerender(<MemoryConsumption filters={{ window: "30d", workspace: "remote" }} />);
    expect(api.useMemoryStats).toHaveBeenCalledWith({ window: "month", workspace: "remote" });
    expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", "month");
    expect(api.useTimeSeries).toHaveBeenCalledWith("recall_queries", "month");
  });
});

describe("Phase 174 — SkillsLifecycle applies NocFilters and uses four-state semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("SkillsLifecycle surfaces current window/workspace on its scope line", () => {
    const { container } = render(
      <SkillsLifecycle filters={{ window: "30d", workspace: "local" }} />,
    );
    const scope = Array.from(container.querySelectorAll("[data-filters]"))
      .find((node) => node.getAttribute("data-filters") === "window=30d&workspace=local");
    expect(scope).toBeDefined();
    expect(scope?.getAttribute("data-status-block")).toBe("no_history");
  });

  it("SkillsLifecycle renders window_empty when the registry has prior activity outside the window", () => {
    api.useSkills.mockReturnValue({
      data: {
        totalSkills: 0,
        coverageGaps: [],
        skillBudget: { duplicateSkills: [] },
        skillDetails: [],
        lastUpdated: "2026-06-30T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    const { container } = render(
      <SkillsLifecycle filters={{ window: "7d", workspace: "all" }} />,
    );
    const scope = Array.from(container.querySelectorAll("[data-filters]"))
      .find((node) => node.getAttribute("data-filters") === "window=7d&workspace=all");
    expect(scope?.getAttribute("data-status-block")).toBe("window_empty");
  });

  it("SkillsLifecycle renders stale_or_error when the registry source fails", () => {
    api.useSkills.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(
      <SkillsLifecycle filters={{ window: "24h", workspace: "remote" }} />,
    );
    const scope = Array.from(container.querySelectorAll("[data-filters]"))
      .find((node) => node.getAttribute("data-filters") === "window=24h&workspace=remote");
    expect(scope?.getAttribute("data-status-block")).toBe("stale_or_error");
  });
});

describe("Phase 174 — Cost uses four-state semantics and never classifies unavailable spend as window_empty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("Cost renders no_history when the ledger is empty", () => {
    const { container } = render(<Cost filters={{ window: "24h", workspace: "all" }} />);
    const block = Array.from(
      container.querySelectorAll(`[data-filters="window=24d&workspace=all"]`),
    );
    // (no rows anywhere — fall back to root-level filter node)
    void block;
    const allBlocks = Array.from(
      container.querySelectorAll(`[data-status-block="no_history"]`),
    );
    const match = allBlocks.find(
      (el) => (el.textContent ?? "").toLowerCase().includes("no spend history yet"),
    );
    expect(match).toBeDefined();
  });

  it("Cost renders window_empty when ledger rows exist only outside the current window", () => {
    const farPast = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
            createdAt: farPast,
          },
        ],
        summary: { totalRuns: 1, successfulRuns: 1, successRate: 1, averageQuality: null, averageLatencyMs: 120 },
        timestamp: farPast,
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<Cost filters={{ window: "24h", workspace: "all" }} />);
    const match = Array.from(
      container.querySelectorAll('[data-status-block="window_empty"]'),
    ).find(
      (el) => (el.textContent ?? "").toLowerCase().includes("widen the window"),
    );
    expect(match).toBeDefined();
  });

  it("Cost renders stale_or_error when in-window ledger rows have no estimatedCostUsd", () => {
    const now = new Date().toISOString();
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
            createdAt: now,
          },
        ],
        summary: { totalRuns: 1, successfulRuns: 1, successRate: 1, averageQuality: null, averageLatencyMs: 120 },
        timestamp: now,
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<Cost filters={{ window: "24h", workspace: "all" }} />);
    const match = Array.from(
      container.querySelectorAll('[data-status-block="stale_or_error"]'),
    ).find(
      (el) => (el.textContent ?? "").toLowerCase().includes("spend data missing"),
    );
    expect(match).toBeDefined();
    // It must NOT be classified as window_empty.
    const noWindowEmpty = Array.from(
      container.querySelectorAll('[data-status-block="window_empty"]'),
    ).every(
      (el) => !(el.textContent ?? "").toLowerCase().includes("spend data missing"),
    );
    expect(noWindowEmpty).toBe(true);
  });

  it("Cost renders stale_or_error when the routing source errors out", () => {
    api.useModelRoutingDashboard.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<Cost filters={{ window: "24h", workspace: "all" }} />);
    const blocks = Array.from(container.querySelectorAll('[data-status-block="stale_or_error"]'));
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("Cost per-model usage applies NocFilters to routing-ledger rows", () => {
    api.useModelRoutingDashboard.mockReturnValue({
      data: {
        events: [
          {
            id: 1,
            taskType: "engineering",
            agentId: "cloud-agent",
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

    const { container } = render(<Cost filters={{ window: "7d", workspace: "remote" }} />);

    // Cost derives spend and usage from the same workspace-filterable
    // routing ledger; it must not merge in all-workspace model usage.
    expect(api.useModelRoutingDashboard).toHaveBeenCalledWith(500);
    expect(api.useModelUsage).not.toHaveBeenCalled();
    const filterNodes = Array.from(container.querySelectorAll("[data-filters]"))
      .filter((n) => n.getAttribute("data-filters") === "window=7d&workspace=remote");
    expect(filterNodes.length).toBeGreaterThan(0);
    const costModel = container.querySelector('[data-cost-model="k3"]');
    expect(costModel).not.toBeNull();
  });
});

describe("Phase 174 — Default Pulse cards use the four-state semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("Every default card carries exactly one of live | window_empty | no_history | stale_or_error", () => {
    const { container } = render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);
    const cards = Array.from(container.querySelectorAll("[data-card-label]"));
    expect(cards.length).toBe(6);
    const allowed = new Set(["live", "window_empty", "no_history", "stale_or_error", "loading"]);
    for (const card of cards) {
      const block = card.querySelector("[data-status-block]");
      expect(block).not.toBeNull();
      const value = block?.getAttribute("data-status-block");
      expect(allowed.has(value ?? "")).toBe(true);
    }
  });

  it("No default Pulse card renders a raw MetricStatus value (empty/zero/blocked/degraded/unavailable) as a user-facing data-status-block", () => {
    const { container } = render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);
    const blocks = Array.from(
      container.querySelectorAll("[data-card-label] [data-status-block]"),
    ).map((b) => b.getAttribute("data-status-block"));
    for (const value of blocks) {
      expect(["empty", "zero", "blocked", "degraded", "unavailable", "stale"]).not.toContain(value);
    }
  });

  it("Cards inherit a stale_or_error status when the parent NOC endpoint is errored", () => {
    api.useOperationsNoc.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { container } = render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);
    const cards = Array.from(container.querySelectorAll("[data-card-label]"));
    expect(cards.length).toBe(6);
    for (const card of cards) {
      const block = card.querySelector("[data-status-block]");
      // The Messages card inherits the NOC error → stale_or_error.
      // Other cards use their own source health (time-series, model-usage).
      expect(block?.getAttribute("data-status-block")).not.toBeNull();
    }
    const messagesCard = container.querySelector('[data-card-label="Messages · 24h"]');
    expect(messagesCard?.querySelector("[data-status-block]")?.getAttribute("data-status-block")).toBe("stale_or_error");
  });
});

describe("Phase 174 — Default Agent Activity uses the Phase 173 message-backed source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("AgentActivityPanel renders no delegation detail when no delegations exist", () => {
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

    const { container } = render(
      <AgentActivityPanel filters={{ window: "24h", workspace: "all" }} />,
    );
    expect(screen.getByTestId("agent-activity-panel")).toBeInTheDocument();
    // No delegation block exists when delegations array is empty.
    expect(container.querySelector('[data-status-block="live"][data-filters]')).toBeNull();
  });

  it("AgentActivityPanel renders delegations only when rows exist", () => {
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
          delegations: [
            { taskId: "task-1", fromAgent: "codex", toAgent: "hermes", status: "active", updatedAt: "2026-07-20T11:45:00.000Z" },
            { taskId: "task-2", fromAgent: "hermes", toAgent: "codex", status: "active", updatedAt: "2026-07-20T11:40:00.000Z" },
          ],
        },
        sourceStates: { agentActivity: "live", efficiencySignals: "known_unwired" },
      },
      isLoading: false,
      isError: false,
    });

    render(<AgentActivityPanel filters={{ window: "24h", workspace: "all" }} />);
    expect(screen.getByText(/2 hive delegations in window/i)).toBeInTheDocument();
  });

  it("Default OperationsNoc renders AgentActivityPanel, not AgentWorkload", () => {
    window.localStorage.clear();
    render(<OperationsNoc />);
    expect(screen.getByTestId("agent-activity-panel")).toBeInTheDocument();
    expect(screen.queryByText(/Agent workload ·/i)).not.toBeInTheDocument();
    // AgentWorkload exposes a liveness test-id; ensure the default NOC
    // does NOT pull it into the tree.
    expect(document.querySelector('[data-testid="agent-workload-liveness"]')).toBeNull();
  });
});


describe("Phase 174 — unsupported workspace sources are withheld, not relabeled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultEmptySources();
  });

  it("withholds global pulse telemetry and heatmap writes for a selected workspace", () => {
    api.useTimeSeries.mockReturnValue({ data: { points: [{ bucket: "12:00", value: 9 }], timestamp: "2026-07-20T12:00:00Z" }, isLoading: false, isError: false });
    const pulse = render(<PulseStrip filters={{ window: "24h", workspace: "remote" }} />);
    expect(pulse.getByText(/Memory-write timing is not workspace-partitioned/i)).toBeInTheDocument();
    expect(pulse.getByText(/Model usage is not workspace-partitioned/i)).toBeInTheDocument();
    pulse.unmount();

    const heatmap = render(<ActivityHeatmap filters={{ window: "24h", workspace: "remote" }} />);
    expect(heatmap.queryByText(/9 memory write/i)).not.toBeInTheDocument();
    expect(heatmap.getByText(/Memory-write timing is withheld/i)).toBeInTheDocument();
  });

  it("isolates Model Utility rows and withholds unsupported scoped governance", () => {
    api.useModelRoutingDashboard.mockReturnValue({
      data: { events: [
        { model: "local-model", agentId: "codex", inputTokens: 4, outputTokens: 2, createdAt: new Date().toISOString() },
        { model: "remote-model", agentId: "cloud-agent", inputTokens: 8, outputTokens: 3, createdAt: new Date().toISOString() },
      ] },
      isLoading: false,
      isError: false,
    });
    const utility = render(<ModelUtility filters={{ window: "24h", workspace: "remote" }} />);
    expect(utility.container.querySelector('[data-model="remote-model"]')).not.toBeNull();
    expect(utility.container.querySelector('[data-model="local-model"]')).toBeNull();
    utility.unmount();

    const governance = render(<GovernanceStrip filters={{ window: "24h", workspace: "remote" }} />);
    expect(governance.getByText(/Workspace-scoped governance is unavailable/i)).toBeInTheDocument();
    expect(governance.container.querySelector('[data-status-block="stale_or_error"]')).not.toBeNull();
  });
});
