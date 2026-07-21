import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BehaviorSignals } from "../behavior-signals";
import { MemoryConsumption } from "../memory-consumption";
import { MemoryNotDigested } from "../memory-not-digested";
import { PulseStrip } from "../pulse-strip";
import { Savings } from "../savings-waste";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
  useHiveFeed: vi.fn(),
  useDelegations: vi.fn(),
  useModelUsage: vi.fn(),
  useMemoryStats: vi.fn(),
  useMemoryTierHealth: vi.fn(),
  useTimeSeries: vi.fn(),
  useSecurityReport: vi.fn(),
  useEscalations: vi.fn(),
  useSkills: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
  useHiveFeed: api.useHiveFeed,
  useDelegations: api.useDelegations,
  useModelUsage: api.useModelUsage,
  useMemoryStats: api.useMemoryStats,
  useMemoryTierHealth: api.useMemoryTierHealth,
  useTimeSeries: api.useTimeSeries,
  useSecurityReport: api.useSecurityReport,
  useEscalations: api.useEscalations,
  useSkills: api.useSkills,
  useModelRoutingDashboard: api.useModelRoutingDashboard,
}));


describe("Round 2 blocking fixes — UI", () => {
  it("[F3] Memory activity does not coerce absent series buckets to numeric 0", () => {
    // Finding (3): Memory activity chart must NOT zero-fill absent
    // series buckets. The component should render them as visible
    // gaps, not numeric zeros that misrepresent missing data as
    // measured activity.
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: {
          status: "completed",
          batch_size: 0,
          started_at: null,
          error_message: null,
        },
        pendingUnconsolidated: 0,
        tierStats: [],
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useTimeSeries.mockImplementation((metric: string) => ({
      data: { points: [], metric, window: "day", timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    }));
    const { container } = render(
      <MemoryConsumption filters={{ window: "24h", workspace: "all" }} />
    );
    // The chart should NOT receive zero-filled arrays. With zero
    // points, the AreaStack input series must be empty or visibly
    // non-zero-filled. We assert by checking that the rendered chart
    // series data is empty rather than 24 zeros per series.
    const dataNode = container.querySelector("[data-series]");
    // The AreaStack component must not receive a series with all zeros
    // when the source has no points. The component must render an
    // explicit empty-state block instead.
    expect(screen.getByText(/nothing in last 24 hours.*widen the window/i)).toBeInTheDocument();
    // Ensure no zero-filled series is rendered (the chart should
    // either receive an empty series or render an explicit gap
    // message; in either case the SVG should NOT have data points
    // mapped from "null -> 0").
    expect(dataNode?.textContent ?? "").not.toMatch(/^0+$/);
  });

  it("[F4] Model tokens card does not label the workspace its request does not partition", () => {
    // Finding (4): The Model tokens card's envelope scope must NOT
    // claim workspace=local when /api/model-usage does not partition
    // by workspace.
    api.useOperationsNoc.mockReturnValue({
      data: {
        metrics: {
          memoryRows: {
            value: 1,
            status: "live",
            source: "sqlite://messages",
            observedAt: "2026-07-13T12:00:00Z",
            freshnessMs: 100,
            scope: { window: "24h", workspace: "all" },
            reason: "ok",
          },
          activeDispatches: {
            value: 0,
            status: "empty",
            source: "sqlite://hive_delegations",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "all", workspace: "all" },
            reason: "cumulative",
          },
          failedWork: {
            value: 0,
            status: "empty",
            source: "sqlite://hive_delegations",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "all", workspace: "all" },
            reason: "cumulative",
          },
          governanceEvents: {
            value: 0,
            status: "empty",
            source: "sqlite://audit_entries",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "24h", workspace: "all" },
            reason: "ok",
          },
          enabledSkills: {
            value: 0,
            status: "empty",
            source: "sqlite://skill_registry",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "all", workspace: "all" },
            reason: "cumulative",
          },
          cronWarnings: {
            value: 0,
            status: "empty",
            source: "sqlite://cron_health_jobs",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "all", workspace: "all" },
            reason: "cumulative",
          },
          localFootprint: {
            value: 0,
            status: "live",
            source: "local://footprint",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "24h", workspace: "all" },
            reason: "ok",
          },
          efficiency: {
            value: null,
            status: "empty",
            source: "durable://efficiency_events",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "24h", workspace: "all" },
            reason: "empty",
          },
        },
      },
      isLoading: false,
      isError: false,
    });
    api.useHiveFeed.mockReturnValue({ data: { actions: [] }, isError: false });
    api.useDelegations.mockReturnValue({ data: { delegations: [] }, isError: false });
    api.useModelUsage.mockReturnValue({
      data: {
        usage: {
          models: [],
          total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, requests: 0 },
        },
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });

    render(
      <PulseStrip filters={{ window: "24h", workspace: "local" }} />
    );

    // The Active models card for a workspace=local request must
    // advertise scope.workspace=all (since /api/model-usage does
    // NOT partition by workspace) OR clearly disclose this
    // limitation. Either way it must NOT pretend to be local.
    const cards = screen.getAllByText(/active models/i);
    expect(cards.length).toBeGreaterThan(0);
    // The card's source/observed metadata or subline must disclose
    // that the model-usage query is windowed-only, not partitioned
    // by workspace.
    const docText = document.body.textContent ?? "";
    expect(docText).toMatch(/model-usage.*workspace|workspace.*not (applied|partitioned|honored)/i);
  });

  it("[F5] Savings never renders a zero/blank sparkline when model-usage is failed/loading/unavailable", () => {
    // Finding (5): Savings must never show 0/blank sparkline when
    // /api/model-usage is failed, loading, or absent.
    api.useModelUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<Savings filters={{ window: "24h", workspace: "all" }} />);

    // Savings must surface the "baseline unavailable" reason (rendered
    // with a <br /> between words, so we match the joined text content)
    // and must NOT render the [0,0] sparkline when model-usage is loading.
    expect(container.textContent ?? "").toMatch(/baseline.*unavailable/i);
    // The savings card must surface a withheld sparkline notice (not a
    // sparkline) when model-usage is loading.
    expect(
      container.querySelector('[data-status-block="savings-sparkline-withheld"]')
    ).toBeInTheDocument();
    // We verify by checking that the Savings card does not render
    // fabricated "0 requests · 0 tokens" totals.
    expect(container.textContent ?? "").not.toMatch(/0 requests/i);
    expect(container.textContent ?? "").not.toMatch(/0 tokens/i);
    // The "requests/tokens withheld" disclosure must be present.
    expect(container.textContent ?? "").toMatch(/withheld/i);
  });

  it("[F5b] Savings renders a non-zero sparkline from real model-usage data", () => {
    api.useModelUsage.mockReturnValue({
      data: {
        usage: {
          models: [
            { id: "m1", name: "m1", totalTokens: 100 },
            { id: "m2", name: "m2", totalTokens: 200 },
            { id: "m3", name: "m3", totalTokens: 50 },
          ],
          total: { inputTokens: 100, outputTokens: 200, cacheRead: 50, requests: 3 },
        },
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    render(<Savings filters={{ window: "24h", workspace: "all" }} />);
    expect(screen.getByText(/3 requests/i)).toBeInTheDocument();
    expect(screen.getByText(/350 tokens/i)).toBeInTheDocument();
  });

  it("[F6] Behavior Signals discloses fixed-scope window/workspace", () => {
    // Finding (6): Behavior signals must apply or disclose fixed-scope.
    api.useSecurityReport.mockReturnValue({
      data: {
        summary: { highSeverity: 0, blockedAttempts: 0, securityEvents: 0 },
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useEscalations.mockReturnValue({
      data: { escalations: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    api.useSkills.mockReturnValue({
      data: { skillDetails: [], coverageGaps: [], skillBudget: { duplicateSkills: [] } },
      isLoading: false,
      isError: false,
    });
    api.useModelRoutingDashboard.mockReturnValue({
      data: { events: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: null,
        pendingUnconsolidated: 0,
        tierStats: [],
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });

    render(<BehaviorSignals filters={{ window: "7d", workspace: "remote" }} />);

    // Behavior Signals must disclose fixed-scope for its feeds.
    const docText = document.body.textContent ?? "";
    expect(docText).toMatch(/fixed.cumulative|fixed.snapshot|do(es)? not (partition|honor)/i);
  });

  it("[F7] Behavior Signals drilldown links carry selected scope and disclose destination scope", () => {
    // Finding (7): Behavior Signals drilldowns must carry from_window,
    // from_workspace, and from_scope_note in the URL so destinations
    // can disclose the originating scope.
    api.useSecurityReport.mockReturnValue({
      data: {
        summary: { highSeverity: 2, blockedAttempts: 0, securityEvents: 1 },
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useEscalations.mockReturnValue({
      data: {
        escalations: [
          { id: "e1", status: "open", agent_id: "codex" },
        ],
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useSkills.mockReturnValue({
      data: {
        skillDetails: [
          { name: "s1", health: "coverage-gap", reviewStatus: "unreviewed" },
        ],
        coverageGaps: ["s1"],
        skillBudget: { duplicateSkills: [] },
      },
      isLoading: false,
      isError: false,
    });
    api.useModelRoutingDashboard.mockReturnValue({
      data: { events: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: null,
        pendingUnconsolidated: 1,
        tierStats: [],
        sources: [],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });

    render(<BehaviorSignals filters={{ window: "7d", workspace: "remote" }} />);

    // All drilldown links must carry from_window, from_workspace,
    // from_scope_note. The destination scope note must clearly state
    // that the destination has a different scope.
    const auditLinks = document.querySelectorAll('a[href*="/audit"]');
    expect(auditLinks.length).toBeGreaterThan(0);
    auditLinks.forEach((link) => {
      const href = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      expect(href).toContain("from_window=7d");
      expect(href).toContain("from_workspace=remote");
      expect(href).toContain("from_scope_note=");
    });
  });

  it("[F7b] Memory Not Digested drilldown links carry selected scope and disclose destination scope", () => {
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: { status: "completed", batch_size: 12, started_at: "2026-07-13T11:59:00Z", error_message: null },
        pendingUnconsolidated: 5,
        tierStats: [],
        sources: [{ agent_id: "codex", cnt: 3 }],
        recentFailures24h: 0,
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useMemoryTierHealth.mockReturnValue({
      data: { tiers: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });

    render(<MemoryNotDigested filters={{ window: "7d", workspace: "remote" }} />);

    const links = screen.getAllByRole("link", { name: /investigate/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      const href = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      expect(href).toContain("from_window=7d");
      expect(href).toContain("from_workspace=remote");
      expect(href).toContain("from_scope_note=");
    });
  });
});
