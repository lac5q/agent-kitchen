import { fireEvent, render, screen } from "@testing-library/react";
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
  Line: ({ dataKey }: { dataKey?: string | (() => unknown) }) => {
    if (typeof dataKey === "function") dataKey();
    return null;
  },
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: ({ formatter }: { formatter?: (value: unknown, name: unknown) => [string, string] }) => {
    const formatted = formatter?.(0.81234, "W");
    return formatted ? <div data-testid="mock-tooltip">{formatted.join(":")}</div> : null;
  },
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

  it("KpiTimelinePanel renders loading and filtered-empty states with source reasons", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    const loading = render(<KpiTimelinePanel />);
    expect(loading.container.querySelector("[data-kpi-timeline-loading]")).toHaveTextContent("Loading timeline...");
    loading.unmount();

    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "run-outside-filter",
            traceId: "trace-1",
            agentId: "agent-2",
            role: "default",
            compositeW: 0.64,
            trusted: true,
            completedAt: "2026-05-01T00:00:00.000Z",
            layers: {
              l1: { score: 0.7, scorers: [] },
              l2: { score: 0.6, scorers: [] },
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

    render(<KpiTimelinePanel agentId="agent-1" dateRange={{ since: "2026-05-10T00:00:00.000Z" }} />);
    expect(screen.getByText(/no eval runs found for agent agent-1 since 2026-05-10/i)).toBeInTheDocument();
    expect(screen.getByText(/1 eval runs from \/api\/evals\/history\?limit=200/i)).toBeInTheDocument();
  });

  it("KpiTimelinePanel summarizes live filtered runs and lets layer toggles change state", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "run-old",
            traceId: "trace-old",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.1,
            trusted: true,
            completedAt: "2026-04-01T00:00:00.000Z",
            layers: {
              l1: { score: 0.1, scorers: [] },
              l2: { score: 0.1, scorers: [] },
              l3: { score: 0.1, scorers: [{ metadata: {} }] },
            },
            scorerResults: [],
            judge: {},
            driftGuard: { status: "passed" },
          },
          {
            id: "run-live",
            traceId: "trace-live",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.92,
            trusted: true,
            completedAt: "2026-05-21T00:00:00.000Z",
            layers: {
              l1: { score: 0.93, scorers: [] },
              l2: { score: 0.91, scorers: [] },
              l3: { score: 0.88, scorers: [{ metadata: {} }] },
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

    const { container } = render(
      <KpiTimelinePanel agentId="agent-1" dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />,
    );

    expect(container.querySelector("[data-kpi-timeline-scope]")).toHaveAttribute(
      "data-kpi-timeline-scope",
      "agentId=agent-1, since=2026-05-01",
    );
    expect(screen.getByText(/1 run shown/i)).toBeInTheDocument();
    expect(container.querySelector("[data-kpi-timeline-runs-status]")).toHaveAttribute("data-kpi-timeline-runs-status", "live");
    expect(screen.getByText(/l3: live/i)).toBeInTheDocument();

    const l1 = container.querySelector<HTMLInputElement>("[data-kpi-layer-toggle='l1']");
    expect(l1).toBeChecked();
    fireEvent.click(l1!);
    expect(l1).not.toBeChecked();

    const l2 = container.querySelector<HTMLInputElement>("[data-kpi-layer-toggle='l2']");
    const l3 = container.querySelector<HTMLInputElement>("[data-kpi-layer-toggle='l3']");
    expect(l2).toBeChecked();
    expect(l3).toBeChecked();
    fireEvent.click(l2!);
    fireEvent.click(l3!);
    expect(l2).not.toBeChecked();
    expect(l3).not.toBeChecked();
    expect(screen.getByTestId("mock-tooltip")).toHaveTextContent("0.8123:W");
  });

  it("KpiTimelinePanel applies until filters and renders unavailable L3 fallback line", () => {
    apiMock.useEvalHistory.mockReturnValue({
      data: {
        runs: [
          {
            id: "run-after",
            traceId: "trace-after",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.7,
            trusted: true,
            completedAt: "2026-05-22T00:00:00.000Z",
            layers: {
              l1: { score: 0.7, scorers: [] },
              l2: { score: 0.7, scorers: [] },
              l3: { score: null, scorers: [{ metadata: { unavailable: true } }] },
            },
            scorerResults: [],
            judge: {},
            driftGuard: { status: "passed" },
          },
          {
            id: "run-inside",
            traceId: "trace-inside",
            agentId: "agent-1",
            role: "default",
            compositeW: 0.6,
            trusted: true,
            completedAt: "2026-05-20T00:00:00.000Z",
            layers: {
              l1: { score: 0.6, scorers: [] },
              l2: { score: 0.6, scorers: [] },
              l3: { score: null, scorers: [{ metadata: { unavailable: true } }] },
            },
            scorerResults: [],
            judge: {},
            driftGuard: { status: "passed" },
          },
        ],
        timestamp: "2026-05-22T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <KpiTimelinePanel
        agentId="agent-1"
        dateRange={{ since: "2026-05-01T00:00:00.000Z", until: "2026-05-21T00:00:00.000Z" }}
      />,
    );

    expect(screen.getByText(/1 run shown/i)).toBeInTheDocument();
    expect(screen.getByText(/l3: unavailable/i)).toBeInTheDocument();
    expect(container.querySelector("[data-kpi-timeline-scope]")).toHaveAttribute(
      "data-kpi-timeline-scope",
      "agentId=agent-1, since=2026-05-01",
    );
  });

  it("AdapterStatusPanel renders loading and error states with truthful status badges", () => {
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });
    const loading = render(<AdapterStatusPanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(loading.container.querySelector("[data-adapter-loading]")).toHaveTextContent("Loading...");
    expect(loading.container.querySelector("[data-adapter-events-status]")).toHaveAttribute("data-adapter-events-status", "blocked");
    loading.unmount();

    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("l3 store unavailable"),
    });
    const error = render(<AdapterStatusPanel agentId="agent-1" dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(error.container.querySelector("[data-adapter-error]")).toHaveTextContent(/l3 store unavailable/i);
    expect(error.container.querySelector("[data-adapter-events-status]")).toHaveAttribute("data-adapter-events-status", "error");
    expect(error.container.querySelector("[data-adapter-source]")).toHaveTextContent(
      "/api/l3/events?agentId=agent-1&since=2026-05-01T00%3A00%3A00.000Z",
    );
  });

  it("AdapterStatusPanel groups live events by adapter and shows latest poll time", () => {
    apiMock.useBusinessOutcomeEvents.mockReturnValue({
      data: {
        events: [
          { adapter: "hubspot", polledAt: "2026-05-20T10:00:00.000Z" },
          { adapter: "hubspot", polledAt: "2026-05-21T10:00:00.000Z" },
          { adapter: "quickbooks", polledAt: "2026-05-19T09:30:00.000Z" },
        ],
        count: 3,
        timestamp: "2026-05-21T11:00:00.000Z",
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<AdapterStatusPanel dateRange={{ since: "2026-05-01T00:00:00.000Z" }} />);
    expect(container.querySelector("[data-adapter-events-status]")).toHaveAttribute("data-adapter-events-status", "live");
    expect(container.querySelector("[data-adapter-events='hubspot']")).toHaveTextContent("2");
    expect(container.querySelector("[data-adapter-row='hubspot']")).toHaveAttribute("data-adapter-row-status", "live");
    expect(container.querySelector("[data-adapter-row='intercom']")).toHaveAttribute("data-adapter-row-status", "empty");
    expect(container.querySelector("[data-adapter-last-polled='hubspot']")).not.toHaveTextContent("—");
    expect(container.querySelector("[data-adapter-reason]")).not.toBeInTheDocument();
  });
});
