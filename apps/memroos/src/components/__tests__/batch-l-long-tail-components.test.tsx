import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  useAuditLog: vi.fn(),
  useHiveFeed: vi.fn(),
  useTimeSeries: vi.fn(),
  useRecallStats: vi.fn(),
  useAgents: vi.fn(),
  useAgentPeers: vi.fn(),
  useSecurityReport: vi.fn(),
  useEscalations: vi.fn(),
  useSkills: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useMemoryStats: vi.fn(),
}));

const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => api);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/shared/time-series-chart", () => ({
  TimeSeriesChart: ({ points, onWindowChange }: { points: unknown[]; onWindowChange: (value: string) => void }) => (
    <button type="button" data-testid="time-series-chart" onClick={() => onWindowChange("month")}>
      points={points.length}
    </button>
  ),
}));

vi.mock("@/components/shared/charts", () => ({
  HBars: ({ rows }: { rows: Array<{ label: string; value: number }> }) => (
    <div data-testid="hbars">{rows.map((row) => `${row.label}:${row.value}`).join(",")}</div>
  ),
}));

vi.mock("@/components/operations/noc-primitives", () => ({
  Eyebrow: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Mono: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  NocCard: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  NocPanelHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
    <header>
      <h2>{title}</h2>
      {right}
    </header>
  ),
  PillBtn: ({ children, href, onClick }: { children: React.ReactNode; href?: string; onClick?: () => void }) =>
    href ? <a href={href}>{children}</a> : <button onClick={onClick}>{children}</button>,
  SourceStatusBadge: ({ status }: { status: string }) => <span data-testid={`status-${status}`}>{status}</span>,
  severityColor: () => "#f00",
}));

import { AgentLivenessBadge } from "@/components/agents/agent-liveness-badge";
import { HealthPanel } from "@/components/library/health-panel";
import { LedgerAnalyticsPanel } from "@/components/ledger/analytics-panel";
import { AuditLogPanel } from "@/components/memroos/audit-log-panel";
import { HiveFeed } from "@/components/memroos/hive-feed";
import { AgentWorkload } from "@/components/operations/agent-workload";
import { BehaviorSignals } from "@/components/operations/behavior-signals";
import { SkillHeatmap } from "@/components/skill-heatmap";
import { SqliteHealthPanel } from "@/components/ledger/sqlite-health-panel";
import { NodeDetailRail } from "@/components/workflow/node-detail-rail";

describe("Batch L long-tail component branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    global.fetch = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  });

  it("renders audit and hive loading, empty, and fallback color states", () => {
    api.useAuditLog.mockReturnValueOnce({ data: undefined, isLoading: true });
    const auditLoading = render(<AuditLogPanel />);
    expect(auditLoading.container.querySelector(".animate-spin")).toBeInTheDocument();
    auditLoading.unmount();

    api.useAuditLog.mockReturnValueOnce({
      isLoading: false,
      data: { entries: [{ id: "a1", severity: "unknown", actor: "agent", action: "did", target: "thing", timestamp: "bad-date" }] },
    });
    render(<AuditLogPanel />);
    expect(screen.getByText("did")).toBeInTheDocument();
    expect(screen.getByText("bad-date")).toBeInTheDocument();

    api.useHiveFeed.mockReturnValueOnce({ data: undefined, isLoading: true });
    const hiveLoading = render(<HiveFeed />);
    expect(hiveLoading.container.querySelector(".animate-spin")).toBeInTheDocument();
    hiveLoading.unmount();

    api.useHiveFeed.mockReturnValueOnce({ data: { actions: [] }, isLoading: false });
    const hiveEmpty = render(<HiveFeed />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    hiveEmpty.unmount();

    api.useHiveFeed.mockReturnValueOnce({
      isLoading: false,
      data: { actions: [{ id: "h1", agent_id: "agent", action_type: "custom", summary: "summary", timestamp: "bad-date" }] },
    });
    render(<HiveFeed />);
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getAllByText("bad-date").length).toBeGreaterThan(0);
  });

  it("surfaces ledger analytics loading, empty, zero, live, and window changes", () => {
    api.useTimeSeries.mockImplementation((metric: string) => {
      if (metric === "docs_ingested") return { data: undefined, isLoading: true, error: null };
      if (metric === "memory_writes") return { data: { points: [], timestamp: "2026-01-01T00:00:00.000Z" }, isLoading: false, error: null };
      return { data: { points: [{ bucket: "b1", value: 0 }], timestamp: "2026-01-01T00:00:00.000Z" }, isLoading: false, error: null };
    });

    render(<LedgerAnalyticsPanel />);
    expect(screen.getByText(/loading \/api\/time-series\?metric=docs_ingested/i)).toBeInTheDocument();
    expect(screen.getByText(/returned no week buckets/i)).toBeInTheDocument();
    expect(screen.getByText(/measured zero/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("time-series-chart")[0]);
    expect(screen.getAllByText(/window=month/i).length).toBeGreaterThan(0);
  });

  it("runs SQLite ingest success and error button states with formatted stats", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    api.useRecallStats.mockReturnValue({
      data: {
        rowCount: 1_250,
        dbSizeBytes: 2_097_152,
        lastIngest: "2026-01-01T23:30:00.000Z",
        lastRecallQuery: "a very long recall query string",
      },
      isLoading: false,
      isError: false,
    });
    const { rerender } = render(<SqliteHealthPanel />);
    expect(screen.getByText("1.3K")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run ingest/i }));
    await vi.runAllTimersAsync();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["recall-stats"] });

    vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    rerender(<SqliteHealthPanel />);
    fireEvent.click(screen.getByRole("button", { name: /run ingest/i }));
    await vi.runAllTimersAsync();
    expect(screen.getByRole("button", { name: /ingest failed/i })).toBeInTheDocument();
  });

  it("renders agent workload sorted rows, error, empty, and liveness badges", () => {
    api.useAgents.mockReturnValue({
      data: {
        agents: [
          { id: "a1", liveness: { state: "stale", observedAt: "2026-01-01T00:00:00.000Z", freshnessMs: 120_000, source: "test", reason: "old" } },
          { id: "a2", liveness: { state: "error", observedAt: null, freshnessMs: null, source: "test", reason: "bad" } },
        ],
        liveness: { value: 0, status: "error", reason: "none live" },
        summary: { active: { value: 2 } },
      },
      isLoading: false,
      isError: false,
    });
    api.useHiveFeed.mockReturnValue({
      data: { actions: [{ agent_id: "a2", action_type: "error" }, { agent_id: "a1", action_type: "continue" }, { agent_id: "a2", action_type: "continue" }] },
      isLoading: false,
      isError: false,
      dataUpdatedAt: 123,
    });
    api.useAgentPeers.mockReturnValue({ data: { peers: [] }, isLoading: false, isError: false });
    render(<AgentWorkload filters={{ window: "7d", workspace: "ops" }} />);
    expect(screen.getByTestId("hbars")).toHaveTextContent("a2:2,a1:1");
    expect(screen.getByText("1 errors")).toBeInTheDocument();
    expect(screen.getAllByText(/stale|error/).length).toBeGreaterThan(1);

    api.useHiveFeed.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true });
    api.useAgents.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });
    api.useAgentPeers.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false });
    const failed = render(<AgentWorkload />);
    expect(failed.getByText(/failed to load \/api\/hive/i)).toBeInTheDocument();
  });

  it("renders behavior signals and dismisses visible signals", () => {
    api.useSecurityReport.mockReturnValue({ data: { summary: { highSeverity: 1 } }, isError: false });
    api.useEscalations.mockReturnValue({ data: { escalations: [{ status: "open" }] }, isError: false });
    api.useSkills.mockReturnValue({ data: { skillDetails: [{ health: "needs-source" }] }, isError: false });
    api.useModelRoutingDashboard.mockReturnValue({ data: { events: [{ success: false }] }, isError: false });
    api.useMemoryStats.mockReturnValue({ data: { pendingUnconsolidated: 2 }, isError: true });

    render(<BehaviorSignals filters={{ window: "24h", workspace: "all" }} />);
    expect(screen.getByText(/high-severity security events/i)).toBeInTheDocument();
    expect(screen.getByText(/one or more noc sources failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    expect(screen.queryByText(/1 high-severity security events/i)).not.toBeInTheDocument();
  });

  it("covers simple display branches for liveness, rail, heatmap, and health panels", () => {
    render(
      <AgentLivenessBadge
        observation={{ state: "missing", observedAt: "bad-date", freshnessMs: null, source: "test", reason: "missing" }}
        showObserved
      />,
    );
    expect(screen.getByText(/invalid date/i)).toBeInTheDocument();

    render(<NodeDetailRail nodeId={null} />);
    expect(screen.getAllByText(/memroos core/i).length).toBeGreaterThan(0);

    const today = new Date().toISOString().slice(0, 10);
    render(<SkillHeatmap contributionHistory={[{ skill: "beta", date: today, count: 11 }]} days={1} />);
    const cell = screen.getByTestId(`heatmap-cell-beta-${today}`);
    expect(cell).toHaveAttribute("data-count", "11");
    fireEvent.mouseEnter(cell);
    expect(cell.className).toContain("ring-2");

    render(<HealthPanel totalFiles={100} collections={[
      { name: "meet-recordings", docCount: 3, lastUpdated: null } as never,
      { name: "healthy", docCount: 20, lastUpdated: new Date().toISOString() } as never,
    ]} />);
    expect(screen.getByText(/missing spark-recordings/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3 files/i).length).toBeGreaterThan(0);
  });
});
