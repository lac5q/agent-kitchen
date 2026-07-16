import { render, screen } from "@testing-library/react";
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
});
