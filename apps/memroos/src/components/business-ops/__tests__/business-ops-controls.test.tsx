import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BusinessOpsPage from "@/app/business-ops/page";
import { KpiTimelinePanel } from "../kpi-timeline-panel";
import { AdapterStatusPanel } from "../adapter-status-panel";

const apiMock = vi.hoisted(() => ({
  useAgents: vi.fn(),
  useEvalConfig: vi.fn(),
  useEvalHistory: vi.fn(),
  useBusinessOutcomeEvents: vi.fn(),
}));

vi.mock("@/lib/api-client", () => apiMock);

vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("Business Ops controls", () => {
  it("exposes a date range and agent filter with visible scope", () => {
    apiMock.useAgents.mockReturnValue({ data: { agents: [{ id: "agent-1", name: "Agent One" }] } });
    apiMock.useEvalConfig.mockReturnValue({ data: null });
    apiMock.useEvalHistory.mockReturnValue({ data: { runs: [], timestamp: "2026-05-21T00:00:00.000Z" }, isLoading: false, error: null });
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: { events: [], count: 0, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<BusinessOpsPage />);

    expect(screen.getByLabelText(/date range/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^agent$/i)).toBeInTheDocument();
    expect(screen.getByText(/scope: since=/i)).toBeInTheDocument();
  });

  it("explains timeline load failures with the failing source", () => {
    apiMock.useAgents.mockReturnValue({ data: { agents: [] } });
    apiMock.useEvalConfig.mockReturnValue({ data: null });
    apiMock.useEvalHistory.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("/api/evals/history: 500"),
    });
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: { events: [], count: 0, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<KpiTimelinePanel />);
    expect(screen.getByText(/failed to load timeline data/i)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/evals\/history/i)).toBeInTheDocument();
  });

  it("renders adapter status with truthful envelopes and distinct not-wired state", () => {
    apiMock.useAgents.mockReturnValue({ data: { agents: [] } });
    apiMock.useEvalConfig.mockReturnValue({ data: null });
    apiMock.useEvalHistory.mockReturnValue({ data: { runs: [], timestamp: "2026-05-21T00:00:00.000Z" }, isLoading: false, error: null });
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: { events: [], count: 0, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<AdapterStatusPanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(screen.getByText(/adapter status/i)).toBeInTheDocument();
    expect(screen.getByText(/salesforce/i)).toBeInTheDocument();
    // Not-wired adapters should never be rendered as live/healthy.
    expect(screen.getAllByText(/not wired/i).length).toBeGreaterThan(0);
  });

  it("reports the same filtered run count as the timeline", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "recent", traceId: "trace-recent", agentId: "ops-agent", role: "default", compositeW: 0.84, trusted: true,
            completedAt: "2026-07-17T16:26:39.788Z",
            layers: { l1: { score: 0.9, scorers: [] }, l2: { score: 0.85, scorers: [] } },
            scorerResults: [], judge: {}, driftGuard: { status: "passed" },
          },
          {
            id: "old", traceId: "trace-old", agentId: "uat-test-agent", role: "default", compositeW: 0.72, trusted: true,
            completedAt: "2026-05-17T08:09:40.697Z",
            layers: { l1: { score: 0.7, scorers: [] }, l2: { score: 0.75, scorers: [] } },
            scorerResults: [], judge: {}, driftGuard: { status: "passed" },
          },
        ],
        timestamp: "2026-07-20T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });

    render(<KpiTimelinePanel dateRange={{ since: "2026-06-20T00:00:00.000Z" }} />);

    expect(document.querySelector("[data-kpi-timeline-runs-status]")).toHaveTextContent("runs: live (1)");
    expect(document.querySelector("[data-kpi-timeline-reason]")).toHaveTextContent("1 eval runs");
  });

  it("KpiTimelinePanel renders L3 as N/A (unavailable) when scorers are marked unavailable", () => {
    apiMock.useAgents.mockReturnValue({ data: { agents: [] } });
    apiMock.useEvalConfig.mockReturnValue({ data: null });
    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "run-1",
            traceId: "trace-1",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.84,
            trusted: true,
            completedAt: "2026-05-21T00:00:00.000Z",
            layers: {
              l1: { score: 0.9, scorers: [] },
              l2: { score: 0.85, scorers: [] },
              l3: { score: null, scorers: [{ metadata: { unavailable: true } }] },
            },
            scorerResults: [],
            judge: {},
            driftGuard: { status: "passed" },
          },
        ],
        timestamp: "2026-05-21T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: { events: [], count: 0, timestamp: "2026-05-21T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });

    render(<KpiTimelinePanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    // L3 unavailable is now surfaced as a non-live envelope.
    expect(screen.getByText(/l3: unavailable/i)).toBeInTheDocument();
  });

  it("KpiTimelinePanel shows loading and empty states with scoped filters", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    const { rerender } = render(<KpiTimelinePanel agentId="ops-agent" dateRange={{ since: "2026-06-01T00:00:00.000Z" }} />);
    expect(screen.getByText(/loading timeline/i)).toBeInTheDocument();

    apiMock.useEvalHistory.mockReturnValue({
      data: { runs: [], timestamp: "2026-07-20T00:00:00.000Z" },
      isLoading: false,
      error: null,
    });
    rerender(
      <KpiTimelinePanel
        agentId="ops-agent"
        dateRange={{ since: "2026-06-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" }}
      />,
    );
    expect(screen.getByText(/No eval runs found for agent ops-agent/i)).toBeInTheDocument();
    expect(document.querySelector("[data-kpi-timeline-empty-reason]")).toBeTruthy();
  });

  it("KpiTimelinePanel toggles layer visibility and renders live L3 line", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "run-live",
            traceId: "trace-live",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.9,
            trusted: true,
            completedAt: "2026-07-17T16:26:39.788Z",
            layers: {
              l1: { score: 0.9, scorers: [] },
              l2: { score: 0.85, scorers: [] },
              l3: { score: 0.7, scorers: [{ metadata: { unavailable: false } }] },
            },
            scorerResults: [],
            judge: {},
            driftGuard: { status: "passed" },
          },
        ],
        timestamp: "2026-07-20T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });

    render(<KpiTimelinePanel dateRange={{ since: "2026-06-01T00:00:00.000Z" }} />);
    expect(screen.getByText("W Score Timeline")).toBeInTheDocument();
    expect(document.querySelector("[data-kpi-timeline-l3-status]")).toHaveTextContent("l3: live");

    fireEvent.click(screen.getByLabelText("L1"));
    fireEvent.click(screen.getByLabelText("L2"));
    fireEvent.click(screen.getByLabelText("L3"));
    expect(screen.getByLabelText("L1")).not.toBeChecked();
  });

  it("AdapterStatusPanel shows loading, error, and live event rows", () => {
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    const { rerender } = render(<AdapterStatusPanel agentId="agent-1" dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(screen.getByTestId ? document.querySelector("[data-adapter-loading]") : null).toBeTruthy();
    expect(screen.getByText(/source: \/api\/l3\/events\?agentId=agent-1/i)).toBeInTheDocument();

    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("upstream 500"),
    });
    rerender(<AdapterStatusPanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    const panel = document.querySelector("[data-adapter-panel]")!;
    expect(panel.querySelector("[data-adapter-error]")).toHaveTextContent(/upstream 500/i);

    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: {
        events: [
          { adapter: "hubspot", polledAt: "2026-05-21T10:00:00.000Z" },
          { adapter: "hubspot", polledAt: "2026-05-21T11:00:00.000Z" },
          { adapter: "intercom", polledAt: "2026-05-21T09:00:00.000Z" },
        ],
        timestamp: "2026-05-21T12:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });
    rerender(<AdapterStatusPanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(document.querySelector("[data-adapter-events='hubspot']")).toHaveTextContent("2");
    expect(document.querySelector("[data-adapter-row-status='live']")).toBeTruthy();
  });
});
