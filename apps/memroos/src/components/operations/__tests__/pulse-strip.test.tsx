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
      hiveActions: envelope<number>({
        status: "empty",
        source: "/api/hive",
        reason: "Healthy source has no hive_actions rows in the selected window",
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
          hiveActions: envelope<number>({
            status: "live",
            value: 3,
            source: "/api/hive",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 2000,
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
      expect(
        within(savingsCard).getByText(
          /Baseline savings blocked until retained-memory\/RTK baseline exists/i
        )
      ).toBeInTheDocument();
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

  it("marks model token card blocked while /api/model-usage is loading", () => {
    api.useOperationsNoc.mockReturnValue({ data: baseMockResponse(), isLoading: false, isError: false });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false });
    api.useDelegations.mockReturnValue({ data: { delegations: [] }, isError: false });
    api.useModelUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<PulseStrip filters={{ window: "7d", workspace: "remote" }} />);

    const tokenCard = screen.getByText(/Model tokens/i).closest("[data-card-label]");
    expect(tokenCard).not.toBeNull();
    if (tokenCard) {
      expect(within(tokenCard).getByText(/Loading \/api\/model-usage/)).toBeInTheDocument();
      expect(tokenCard.querySelector('[data-status="blocked"]')).toBeTruthy();
    }
  });
});


describe("Round 4 blocking fixes — PulseStrip Hive Actions provenance", () => {
  it("[F1] Hive actions card binds to the hiveActions envelope (NOT memoryRows)", () => {
    // The card labelled "Hive actions (window)" must reconcile with
    // the /api/operations/noc hiveActions envelope. Its rendered source
    // label must be /api/hive (NOT sqlite://messages) and the displayed
    // value must reflect the hiveActions measurement.
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
          hiveActions: envelope<number>({
            status: "live",
            value: 12,
            source: "/api/hive",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 2500,
          }),
          activeDispatches: envelope<number>({ status: "empty", source: "sqlite://hive_delegations" }),
          failedWork: envelope<number>({ status: "empty", source: "sqlite://hive_delegations" }),
          governanceEvents: envelope<number>({ status: "empty", source: "sqlite://audit_entries" }),
          enabledSkills: envelope<number>({ status: "empty", source: "sqlite://skill_registry" }),
          cronWarnings: envelope<number>({ status: "empty", source: "sqlite://cron_health_jobs" }),
          localFootprint: envelope<number>({ status: "empty", source: "local://footprint" }),
          efficiency: envelope({ status: "empty", source: "durable://efficiency_events" }),
        },
      },
      isLoading: false,
      isError: false,
    });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    const hiveCard = screen.getByText(/hive actions \(window\)/i).closest("[data-card-label]");
    expect(hiveCard).not.toBeNull();
    if (!hiveCard) return;

    // The "Hive actions" card must render the value=12 from hiveActions.
    expect(within(hiveCard).getByText("12")).toBeInTheDocument();
    // The card must show its source as /api/hive — never sqlite://messages.
    expect(within(hiveCard).getByText(/\/api\/hive/i)).toBeInTheDocument();
    expect(within(hiveCard).queryByText(/sqlite:\/\/messages/i)).not.toBeInTheDocument();
    // Memory rows card still uses sqlite://messages (we did not break it).
    const memoryCard = screen.getByText(/^Memory rows$/i).closest("[data-card-label]");
    expect(memoryCard).not.toBeNull();
    if (memoryCard) {
      expect(within(memoryCard).getByText(/sqlite:\/\/messages/i)).toBeInTheDocument();
    }
  });

  it("[F1] Hive actions card falls back to memoryRows but explicitly discloses the absence of the hive envelope", () => {
    // If the API ever stops exposing hiveActions, the card must NOT
    // silently present memory row data as hive actions. The fallback
    // is allowed (existing behavior) but the rendered source MUST be
    // /api/hive (placeholder) or the fall-back subline must disclose
    // the gap so a user can reconcile what they see.
    const metricsWithoutHive = baseMockResponse().metrics as Record<string, unknown>;
    delete metricsWithoutHive.hiveActions;
    api.useOperationsNoc.mockReturnValue({
      data: { metrics: metricsWithoutHive },
      isLoading: false,
      isError: false,
    });
    setEmptyHookMocks();

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    const hiveCard = screen.getByText(/hive actions \(window\)/i).closest("[data-card-label]");
    expect(hiveCard).not.toBeNull();
    if (!hiveCard) return;
    // The fallback subline discloses the missing hive envelope. This
    // prevents the UI from presenting memoryRow data as hive data.
    expect(
      within(hiveCard).getByText(/backing \/api\/hive envelope not yet supplied/i),
    ).toBeInTheDocument();
  });
});
