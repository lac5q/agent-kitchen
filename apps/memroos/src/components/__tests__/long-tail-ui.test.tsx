import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  useModelUsage: vi.fn(),
}));
const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    useModelUsage: apiMocks.useModelUsage,
  };
});

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="line-chart" data-points={data.length}>{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

import { AgentLivenessBadge } from "@/components/agents/agent-liveness-badge";
import { TimeSeriesChart } from "@/components/shared/time-series-chart";
import { UserMenu } from "@/components/layout/user-menu";
import { AgentCard, formatTimeAgo } from "@/components/memroos/agent-card";
import { MemoryList } from "@/components/notebooks/memory-list";
import { ModelUtility } from "@/components/operations/model-utility";
import { SlaCountdown } from "@/components/escalations/sla-countdown";
import { NodeDetailRail } from "@/components/workflow/node-detail-rail";
import type { Agent, MemoryInventoryRow } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navMocks.push }),
}));

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Atlas",
    role: "Operator",
    platform: "codex",
    protocol: "rest",
    status: "active",
    lastHeartbeat: new Date(Date.now() - 90_000).toISOString(),
    lessonsCount: 2,
    todayMemoryCount: 3,
    isRemote: false,
    location: null,
    masterId: null,
    currentTask: null,
    latencyMs: null,
    ...overrides,
  } as Agent;
}

function memory(overrides: Partial<MemoryInventoryRow> = {}): MemoryInventoryRow {
  return {
    id: "mem-1",
    category: "knowledge_file",
    label: "Knowledge",
    backend: "sqlite",
    source: "library",
    timestamp: "2026-01-01T00:00:00.000Z",
    content: "Short memory",
    consolidationState: "raw",
    evidencePointer: null,
    ...overrides,
  } as MemoryInventoryRow;
}

describe("long-tail UI components", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
    vi.clearAllMocks();
    apiMocks.useModelUsage.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("formats AgentCard times and renders remote, harness, and subagent branches", () => {
    expect(formatTimeAgo(null)).toBe("never");
    expect(formatTimeAgo(new Date(Date.now() - 10_000).toISOString())).toBe("just now");
    expect(formatTimeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatTimeAgo(new Date(Date.now() - 3 * 60 * 60_000).toISOString())).toBe("3h ago");
    expect(formatTimeAgo(new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString())).toBe("2d ago");

    const onClick = vi.fn();
    const { rerender } = render(
      <AgentCard
        agent={agent({ isRemote: true, location: "tailscale", latencyMs: 42, currentTask: "Routing" })}
        onClick={onClick}
      />
    );
    expect(screen.getByText("Tailscale")).toBeInTheDocument();
    expect(screen.getByText("~42ms")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Atlas"));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "agent-1" }));

    rerender(<AgentCard agent={agent({ status: "mystery" as Agent["status"], platform: "custom" as Agent["platform"] })} onClick={onClick} childCount={1} />);
    expect(screen.getByText("Harness for")).toBeInTheDocument();
    expect(screen.getByText("1 subagent")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();

    rerender(<AgentCard agent={agent({ masterId: "parent-1", isRemote: true, location: "cloudflare" })} onClick={onClick} harnessName="Parent" />);
    expect(screen.getByText("Subagent of")).toBeInTheDocument();
    expect(screen.getByText("CF Tunnel")).toBeInTheDocument();
  });

  it("renders ModelUtility loading, error, empty, degraded, and live states", () => {
    const { rerender } = render(<ModelUtility />);
    expect(screen.getByText("unavailable")).toBeInTheDocument();

    apiMocks.useModelUsage.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    rerender(<ModelUtility />);
    expect(screen.getByText("Loading model usage...")).toBeInTheDocument();

    apiMocks.useModelUsage.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("boom") });
    rerender(<ModelUtility />);
    expect(screen.getByText(/routing quality is unavailable/)).toHaveTextContent("boom");

    apiMocks.useModelUsage.mockReturnValue({
      data: { usage: { total: { requests: 0, inputTokens: 0, outputTokens: 0 }, models: [] } },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(<ModelUtility filters={{ window: "7d", workspace: "all" }} />);
    expect(screen.getByText(/returned no requests/)).toBeInTheDocument();

    apiMocks.useModelUsage.mockReturnValue({
      data: { usage: { total: { requests: 4, inputTokens: 1_000_000, outputTokens: 2_000 }, models: [] } },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(<ModelUtility />);
    expect(screen.getByText(/aggregate tokens but no per-model rows/)).toBeInTheDocument();

    apiMocks.useModelUsage.mockReturnValue({
      data: {
        usage: {
          total: { requests: 10, inputTokens: 1_000_000, outputTokens: 2_000 },
          models: [
            { id: "opus", name: "Opus", requests: 7, totalTokens: 1_000_000 },
            { id: "haiku", name: "Haiku", requests: 3, totalTokens: 1_500 },
          ],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(<ModelUtility />);
    expect(screen.getByText("TOP")).toBeInTheDocument();
    expect(screen.getByText("1.0m")).toBeInTheDocument();
    expect(screen.getByText("1.5k")).toBeInTheDocument();
  });

  it("renders small status/list/chart components across alternate branches", () => {
    render(
      <AgentLivenessBadge
        observation={{ state: "never", observedAt: null, reason: "no heartbeat", source: "registry", freshnessMs: null }}
        showObserved
      />
    );
    expect(screen.getByText(/never observed/)).toBeInTheDocument();

    const onSelect = vi.fn();
    const { rerender } = render(<MemoryList entries={[]} selected={null} onSelect={onSelect} />);
    expect(screen.getByText(/No memory inventory rows/)).toBeInTheDocument();
    rerender(
      <MemoryList
        entries={[
          memory({
            id: "mem-long",
            category: "unknown" as MemoryInventoryRow["category"],
            content: "x".repeat(100),
            timestamp: null,
            evidencePointer: "evidence://1",
          }),
        ]}
        selected={memory({ id: "mem-long" })}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "mem-long" }));
    expect(screen.getByText("no timestamp")).toBeInTheDocument();
    expect(screen.getByText("evidence://1")).toBeInTheDocument();

    rerender(<SlaCountdown deadline="2026-01-01T12:00:30.000Z" slaSeconds={60} status="pending" />);
    expect(screen.getByRole("timer")).toHaveTextContent("30s");
    rerender(<SlaCountdown deadline="2026-01-01T11:59:59.000Z" slaSeconds={60} status="pending" />);
    expect(screen.getByRole("timer")).toHaveTextContent("Overdue");

    rerender(<NodeDetailRail nodeId="slack" />);
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Already on map")).toBeInTheDocument();
    rerender(<NodeDetailRail nodeId={null} />);
    expect(screen.getByText("MemroOS core")).toBeInTheDocument();
  });

  it("renders UserMenu hover/logout and TimeSeriesChart loading, empty, and chart states", async () => {
    vi.useRealTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "u1", email: "ops@example.com", displayName: "Ops", role: "operator" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    const { rerender } = render(<UserMenu />);
    const logout = await screen.findByRole("button", { name: "Sign out" });
    fireEvent.mouseEnter(logout);
    expect(logout).toHaveStyle({ color: "rgb(122, 42, 30)" });
    fireEvent.mouseLeave(logout);
    expect(logout).toHaveStyle({ background: "transparent" });
    fireEvent.click(logout);
    await waitFor(() => {
      expect(navMocks.push).toHaveBeenCalledWith("/login");
    });

    const changeWindow = vi.fn();
    rerender(
      <TimeSeriesChart
        title="Trend"
        points={[]}
        window="day"
        onWindowChange={changeWindow}
        isLoading
      />
    );
    expect(screen.getByText("Trend")).toBeInTheDocument();

    rerender(<TimeSeriesChart title="Trend" points={[]} window="week" onWindowChange={changeWindow} />);
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Month"));
    expect(changeWindow).toHaveBeenCalledWith("month");

    rerender(
      <TimeSeriesChart
        title="Trend"
        points={[{ bucket: "Jan", value: 5 }]}
        window="month"
        onWindowChange={changeWindow}
        lineColor="#123456"
      />
    );
    const chart = screen.getByTestId("line-chart");
    expect(within(chart).getByTestId("line")).toBeInTheDocument();
    expect(chart).toHaveAttribute("data-points", "1");
  });
});
