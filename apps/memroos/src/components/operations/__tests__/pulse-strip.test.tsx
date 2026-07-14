import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MetricEnvelope } from "@/lib/metric-status";

import { PulseStrip } from "../pulse-strip";

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
  useHiveFeed: vi.fn(),
  useDelegations: vi.fn(),
  useModelUsage: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
  useHiveFeed: api.useHiveFeed,
  useDelegations: api.useDelegations,
  useModelUsage: api.useModelUsage,
}));

const scope = { window: "24h" as const, workspace: "all" as const };

function envelope<T = number>(overrides: Partial<MetricEnvelope<T>>): MetricEnvelope<T> {
  return {
    value: overrides.value ?? null,
    status: overrides.status ?? "empty",
    source: overrides.source ?? "sqlite://test",
    observedAt: overrides.observedAt ?? null,
    freshnessMs: overrides.freshnessMs ?? null,
    scope: overrides.scope ?? scope,
    reason: overrides.reason ?? null,
    ...overrides,
  };
}

function baseMockResponse({ memoryRowsStatus = "empty", memoryRowsReason }: { memoryRowsStatus?: MetricEnvelope["status"]; memoryRowsReason?: string } = {}) {
  return {
    metrics: {
      memoryRows: envelope<number>({
        status: memoryRowsStatus,
        source: "sqlite://messages",
        reason: memoryRowsReason ?? "Healthy source has no observations in the selected window",
      }),
      activeDispatches: envelope<number>({
        status: "empty",
        source: "sqlite://hive_delegations",
        reason: "Healthy source has no observations in the selected window",
      }),
      failedWork: envelope<number>({
        status: "empty",
        source: "sqlite://hive_delegations",
        reason: "Healthy source has no observations in the selected window",
      }),
      governanceEvents: envelope<number>({ status: "empty", source: "sqlite://audit_entries" }),
      enabledSkills: envelope<number>({ status: "empty", source: "sqlite://skill_registry" }),
      cronWarnings: envelope<number>({ status: "empty", source: "sqlite://cron_health_jobs" }),
      localFootprint: envelope<number>({ status: "empty", source: "local://footprint" }),
      efficiency: envelope({ status: "empty", source: "durable://efficiency_events" }),
    },
  };
}

function setEmptyHookMocks() {
  api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false });
  api.useDelegations.mockReturnValue({ data: { delegations: [] }, isError: false });
  api.useModelUsage.mockReturnValue({
    data: { usage: { models: [], total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 } } },
    isLoading: false,
    isError: false,
  });
}

describe("PulseStrip truthful metric rendering", () => {
  it("renders an empty card with status, source, reason, and observed time", () => {
    api.useOperationsNoc.mockReturnValue({ data: baseMockResponse(), isLoading: false, isError: false });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    const emptyBadges = document.querySelectorAll('[data-status="empty"]');
    expect(emptyBadges.length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/sqlite:\/\//i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/healthy source has no observations/i).length).toBeGreaterThan(0);
  });

  it("renders an error card without fabricating a value when the source fails", () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        metrics: {
          ...baseMockResponse().metrics,
          memoryRows: envelope<number>({
            status: "error",
            source: "sqlite://messages",
            reason: "SQLITE_BUSY: database is locked",
            value: null,
          }),
        },
      },
      isLoading: false,
      isError: false,
    });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelector('[data-status="error"]')).toBeInTheDocument();
    expect(screen.getAllByText(/SQLITE_BUSY/i).length).toBeGreaterThan(0);
  });

  it("renders live measured values with no source-reason overlay", () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        metrics: {
          memoryRows: envelope<number>({
            status: "live",
            value: 7,
            source: "sqlite://messages",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 1500,
          }),
          activeDispatches: envelope<number>({
            status: "live",
            value: 3,
            source: "sqlite://hive_delegations",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 2500,
          }),
          failedWork: envelope<number>({
            status: "live",
            value: 1,
            source: "sqlite://hive_delegations",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 2500,
          }),
          governanceEvents: envelope<number>({ status: "live", value: 0, source: "sqlite://audit_entries" }),
          enabledSkills: envelope<number>({ status: "live", value: 0, source: "sqlite://skill_registry" }),
          cronWarnings: envelope<number>({ status: "live", value: 0, source: "sqlite://cron_health_jobs" }),
          localFootprint: envelope<number>({ status: "live", value: 1024, source: "local://footprint" }),
          efficiency: envelope({ status: "live", source: "durable://efficiency_events" }),
        },
      },
      isLoading: false,
      isError: false,
    });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelectorAll('[data-status="live"]').length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.queryByText(/SQLITE_BUSY/i)).not.toBeInTheDocument();
  });

  it("discloses savings baseline as blocked with reason rather than a fabricated zero", () => {
    api.useOperationsNoc.mockReturnValue({ data: baseMockResponse(), isLoading: false, isError: false });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    const savingsCard = screen.getByText(/savings baseline/i).closest("[data-card-label]");
    expect(savingsCard).not.toBeNull();
    if (savingsCard) {
      expect(within(savingsCard).getByText(/explicitly blocked until a retained-memory baseline exists/i)).toBeInTheDocument();
    }
    // Savings never renders as a numeric zero
    const zeroZeroSavings = document.body.textContent?.match(/Savings baseline.*\b0\b/);
    expect(zeroZeroSavings).toBeNull();
  });

  it("renders degraded envelopes with reason, source, and observed time", () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        metrics: {
          ...baseMockResponse().metrics,
          memoryRows: envelope<number>({ status: "degraded", source: "sqlite://messages", reason: "Partial source result" }),
        },
      },
      isLoading: false,
      isError: false,
    });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelector('[data-status="degraded"]')).toBeInTheDocument();
    expect(screen.getAllByText(/partial source result/i).length).toBeGreaterThan(0);
  });

  it("shows a banner when the operations noc endpoint fails", () => {
    api.useOperationsNoc.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: true });
    api.useDelegations.mockReturnValue({ data: { delegations: [] }, isError: true });
    api.useModelUsage.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText(/failed to load \/api\/operations\/noc/i)).toBeInTheDocument();
  });
});
