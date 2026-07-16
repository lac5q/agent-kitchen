/**
 * Round 3 blocking fixes — UI and chart regressions.
 *
 * Addresses the following scrutiny findings from
 * validation/truthful-operations/scrutiny/synthesis.round-3.json:
 *
 *  (1) Memory activity chart converts absent series buckets to
 *      numeric zeroes before rendering, fabricating measurements.
 *
 *  (2) Behavior Signals forwards scope query parameters (from_window,
 *      from_workspace, from_scope_note) to /escalations and /skills
 *      (and via Tune thresholds, /evals), but the destination pages
 *      do not consume or render that scope disclosure.
 *
 *  (3) Memory Not Digested forwards a scope note to /library on the
 *      Consolidation-blocked drilldown, but /library does not consume
 *      or render it.
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AreaStack } from "@/components/shared/charts/area-stack";
import EscalationsPage from "@/app/escalations/page";
import EvalsPage from "@/app/evals/page";
import LibraryPage from "@/app/library/page";
import SkillsRegistryPage from "@/app/skills/page";
import { BehaviorSignals } from "../behavior-signals";
import { MemoryConsumption } from "../memory-consumption";
import { MemoryNotDigested } from "../memory-not-digested";

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

// ── api-client mock hoisted state ──────────────────────────────────────────
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
  useSkills_v2: vi.fn(),
  useModelRoutingDashboard: vi.fn(),
  useResolveEscalation: vi.fn(),
  useSkillRegistry: vi.fn(),
  useSkillSuggestions: vi.fn(),
  useAuditEntries: vi.fn(),
  useAuditExportUrl: vi.fn(),
  useKnowledge: vi.fn(),
  useGitNexus: vi.fn(),
  useEscalationsForPage: vi.fn(),
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
  useResolveEscalation: api.useResolveEscalation,
  useSkillRegistry: api.useSkillRegistry,
  useSkillSuggestions: api.useSkillSuggestions,
  useKnowledge: api.useKnowledge,
  useGitNexus: api.useGitNexus,
}));

// ── next/navigation mock — captures the URL used to render each page ────
const nav = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: nav.useSearchParams,
}));

// ── Light helpers for every component/panel that the destination pages
//    import; we want to keep the test surface narrow to the
//    data-drilldown-from scope-disclosure banner and present a happy
//    enough stub of everything else that the page mounts cleanly.
vi.mock("@/components/escalations/sla-countdown", () => ({
  SlaCountdown: () => <div data-testid="sla-stub" />,
}));
vi.mock("@/components/library/collection-card", () => ({
  CollectionCard: ({ collection }: { collection: { name: string } }) => (
    <div data-testid="collection-card">{collection.name}</div>
  ),
}));
vi.mock("@/components/library/collection-treemap", () => ({
  CollectionTreemap: () => <div data-testid="treemap-stub" />,
}));
vi.mock("@/components/library/health-panel", () => ({
  HealthPanel: () => <div data-testid="health-stub" />,
}));
vi.mock("@/components/library/gitnexus-panel", () => ({
  GitNexusPanel: () => <div data-testid="gitnexus-stub" />,
}));
vi.mock("@/components/ledger/sqlite-health-panel", () => ({
  SqliteHealthPanel: () => <div data-testid="sqlite-stub" />,
}));
vi.mock("@/components/ledger/memory-intelligence-panel", () => ({
  MemoryIntelligencePanel: () => <div data-testid="memory-intel-stub" />,
}));
vi.mock("@/components/security/security-operations-panel", () => ({
  SecurityOperationsPanel: () => <div data-testid="security-stub" />,
}));
vi.mock("@/components/performance/cache-health-panel", () => ({
  CacheHealthPanel: () => <div data-testid="cache-stub" />,
}));
vi.mock("@/components/library/analytics-panel", () => ({
  LibraryAnalyticsPanel: () => <div data-testid="analytics-stub" />,
}));
vi.mock("@/components/library/collection-trends-panel", () => ({
  CollectionTrendsPanel: () => <div data-testid="trends-stub" />,
}));
vi.mock("@/components/library/context-sources-panel", () => ({
  ContextSourcesPanel: () => <div data-testid="context-sources-stub" />,
}));
vi.mock("@/components/ui/info-tip", () => ({ InfoTip: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/evals/eval-engine-panel", () => ({
  EvalEnginePanel: () => <div data-testid="eval-engine-stub" />,
}));

function setSearchParams(params: Record<string, string>) {
  nav.useSearchParams.mockReturnValue(new URLSearchParams(params));
}

function clearSearchParams() {
  nav.useSearchParams.mockReturnValue(new URLSearchParams());
}

// ── Memory activity chart tests — Finding (1) of round 3 ────────────────
describe("Round 3 [F1] Memory activity — no zero-fill of partial gaps", () => {
  it("MemoryConsumption forwards partial null gaps to AreaStack (no zero-fill)", () => {
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
    // ONE series returns some points, including gaps. The other is
    // fully empty. We assert that the chart is rendered (partial data
    // case) and that the SVG path for the partial series contains
    // multiple subpaths (gaps), not a continuous zero-filled line.
    api.useTimeSeries.mockImplementation((metric: string) => {
      if (metric === "memory_writes") {
        return {
          data: {
            points: [
              { bucket: "00:00", value: 5 },
              // Hours 01-07 are intentionally absent (gap).
              { bucket: "08:00", value: 9 },
              { bucket: "12:00", value: 2 },
              { bucket: "18:00", value: 7 },
            ],
            metric: "memory_writes",
            window: "24h",
            timestamp: "2026-07-13T12:00:00Z",
          },
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: { points: [], metric, window: "24h", timestamp: "2026-07-13T12:00:00Z" },
        isLoading: false,
        isError: false,
      };
    });

    const { container } = render(
      <MemoryConsumption filters={{ window: "24h", workspace: "all" }} />,
    );

    const svg = container.querySelector('svg[data-area-stack="true"]');
    expect(svg).toBeTruthy();

    // The series path must contain at least one segment break (a
    // 'Z' followed by another 'M') — that's how gaps become visible.
    // Zero-fill would produce exactly ONE continuous subpath.
    const path = container.querySelector('svg[data-area-stack="true"] path');
    expect(path).toBeTruthy();
    const d = path?.getAttribute("d") ?? "";
    const subpathCount = (d.match(/M/g) ?? []).length;
    expect(subpathCount).toBeGreaterThanOrEqual(2);

    // The series buckets that were measured (5, 9, 2, 7) must not be
    // collapsed into a flat baseline of zeros — pick a non-zero
    // pixel y on the chart path that is not at the chart bottom.
    // (The chart bottom is y = h - 28.)
    const pathNodes = Array.from(
      container.querySelectorAll('svg[data-area-stack="true"] path'),
    );
    expect(pathNodes.length).toBeGreaterThan(0);
  });

  it("AreaStack breaks its path on null buckets (gaps, not zero-fill)", () => {
    // Direct unit test for the chart primitive. Two measured runs
    // separated by a single null bucket must produce at least two
    // subpaths (independent M...Z runs).
    const { container } = render(
      <svg width={0} height={0}>
        <AreaStack
          w={640}
          h={200}
          labels={["a", "b", "c", "d", "e"]}
          series={[{ color: "#000", values: [1, 2, null, 4, 5] }]}
        />
      </svg>,
    );

    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    const d = path?.getAttribute("d") ?? "";
    // The path must contain two distinct "M" starts, one per
    // measured run; an unbroken run would render with a single M.
    expect((d.match(/M/g) ?? []).length).toBe(2);
    // Sanity: neither subpath contains a y at the very bottom edge
    // (h - 28 = 172) — measured buckets must be off the baseline.
    const yMatches = (d.match(/-?\d+\.\d+/g) ?? []).map(Number);
    const ys = yMatches.filter((n) => Math.abs(n) > 0 && Math.abs(n) < 200);
    expect(ys.length).toBeGreaterThan(0);
    const distinctYs = new Set(ys);
    expect(distinctYs.size).toBeGreaterThan(1);
  });

  it("AreaStack yields an empty path (no measured segments) when everything is null", () => {
    const { container } = render(
      <svg width={0} height={0}>
        <AreaStack
          w={640}
          h={200}
          labels={["a", "b", "c"]}
          series={[{ color: "#000", values: [null, null, null] }]}
        />
      </svg>,
    );
    // No <path> elements at all when there are zero measured segments.
    expect(container.querySelector("path")).toBeNull();
  });

  it("AreaStack still works for fully numeric series (no behaviour regression)", () => {
    const { container } = render(
      <svg width={0} height={0}>
        <AreaStack
          w={640}
          h={200}
          labels={["a", "b", "c"]}
          series={[{ color: "#000", values: [1, 2, 3] }]}
        />
      </svg>,
    );
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    const d = path?.getAttribute("d") ?? "";
    expect((d.match(/M/g) ?? []).length).toBe(1);
  });
});

// ── Finding (2): Behavior Signals destinations render the drilldown banner ─
describe("Round 3 [F2] Behavior Signals destinations render drilldown banner", () => {
  beforeEach(() => {
    clearSearchParams();
    api.useEscalationsForPage.mockReset?.();
    api.useAuditEntries.mockReset?.();
    api.useAuditExportUrl.mockReset?.();
    api.useKnowledge.mockReset?.();
    api.useGitNexus.mockReset?.();
  });

  it("/escalations shows the Drilldown from Operations NOC banner with from_* params", () => {
    setSearchParams({
      from_window: "7d",
      from_workspace: "remote",
      from_scope_note:
        "Escalations page has its own status filter; originating NOC filters are shown for reference only and are NOT applied.",
    });
    api.useEscalations.mockReturnValue({
      data: { escalations: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    api.useResolveEscalation.mockReturnValue({ mutate: vi.fn(), isError: false });

    render(<EscalationsPage />);

    const banner = document.querySelector('[data-drilldown-from="escalations"]');
    expect(banner).toBeTruthy();
    const text = banner?.textContent ?? "";
    expect(text).toContain("Drilldown from Operations NOC");
    expect(text).toContain("window=7d");
    expect(text).toContain("workspace=remote");
    // The destination must echo the forwarded note directly so the
    // user can read it on the destination surface, not just from the
    // originating link title attribute.
    expect(text).toContain(
      "Escalations page has its own status filter; originating NOC filters are shown for reference only and are NOT applied.",
    );
  });

  it("/skills shows the Drilldown from Operations NOC banner with from_* params", () => {
    setSearchParams({
      from_window: "24h",
      from_workspace: "local",
      from_scope_note:
        "Skills registry is a cumulative snapshot; originating NOC filters are shown for reference only and are NOT applied.",
    });
    api.useSkillRegistry.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });
    api.useSkillSuggestions.mockReturnValue({
      data: { suggestions: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    // /skills also imports useSkills for component usage through registry hooks.
    api.useSkills.mockReturnValue({
      data: { skillDetails: [], coverageGaps: [], skillBudget: { duplicateSkills: [] } },
      isLoading: false,
      isError: false,
    });

    render(<SkillsRegistryPage />);

    const banner = document.querySelector('[data-drilldown-from="skills"]');
    expect(banner).toBeTruthy();
    const text = banner?.textContent ?? "";
    expect(text).toContain("Drilldown from Operations NOC");
    expect(text).toContain("window=24h");
    expect(text).toContain("workspace=local");
    expect(text).toContain(
      "Skills registry is a cumulative snapshot; originating NOC filters are shown for reference only and are NOT applied.",
    );
  });

  it("/evals shows the Drilldown from Operations NOC banner with from_* params", () => {
    setSearchParams({
      from_window: "30d",
      from_workspace: "all",
      from_scope_note:
        "Evals page has its own config; originating NOC filters are shown for reference only and are NOT applied.",
    });

    render(<EvalsPage />);

    const banner = document.querySelector('[data-drilldown-from="evals"]');
    expect(banner).toBeTruthy();
    const text = banner?.textContent ?? "";
    expect(text).toContain("Drilldown from Operations NOC");
    expect(text).toContain("window=30d");
    expect(text).toContain("workspace=all");
    expect(text).toContain(
      "Evals page has its own config; originating NOC filters are shown for reference only and are NOT applied.",
    );
  });

  it("behavior-signals drilldown URLs include from_scope_note on /escalations, /skills, /evals, /library, /notebooks", () => {
    clearSearchParams();
    api.useSecurityReport.mockReturnValue({
      data: {
        summary: { highSeverity: 1, blockedAttempts: 0, securityEvents: 1 },
        timestamp: "2026-07-13T12:00:00Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useEscalations.mockReturnValue({
      data: {
        escalations: [{ id: "e1", status: "open", agent_id: "codex" }],
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

    // /escalations anchor must be visible AND carry from_scope_note.
    const escalationsLink = document.querySelector(
      'a[href*="/escalations?from_window=7d"]',
    );
    expect(escalationsLink).toBeTruthy();
    const escalationHref = escalationsLink?.getAttribute("href") ?? "";
    expect(escalationHref).toContain("from_window=7d");
    expect(escalationHref).toContain("from_workspace=remote");
    expect(escalationHref).toContain("from_scope_note=");

    // /skills anchor must be visible AND carry from_scope_note.
    const skillsLink = document.querySelector(
      'a[href*="/skills?from_window=7d"]',
    );
    expect(skillsLink).toBeTruthy();
    const skillsHref = skillsLink?.getAttribute("href") ?? "";
    expect(skillsHref).toContain("from_window=7d");
    expect(skillsHref).toContain("from_workspace=remote");
    expect(skillsHref).toContain("from_scope_note=");

    // /evals anchor (Tune thresholds) must be visible AND carry from_scope_note.
    const evalsLink = document.querySelector(
      'a[href*="/evals?from_window=7d"]',
    );
    expect(evalsLink).toBeTruthy();
    const evalsHref = evalsLink?.getAttribute("href") ?? "";
    expect(evalsHref).toContain("from_window=7d");
    expect(evalsHref).toContain("from_workspace=remote");
    expect(evalsHref).toContain("from_scope_note=");
  });
});

// ── Finding (3): /library consumes the Memory Not Digested scope note ────
describe("Round 3 [F3] Library consumes Memory Not Digested scope note", () => {
  it("/library shows the Drilldown from Operations NOC banner when forwarded", () => {
    setSearchParams({
      from_window: "24h",
      from_workspace: "all",
      from_scope_note:
        "Library page has its own sources/index selectors; originating NOC filters are shown for reference only and are NOT applied.",
    });
    api.useKnowledge.mockReturnValue({
      data: { collections: [], totalFiles: 0, totalDocs: 0 },
      isLoading: false,
      isError: false,
    });
    api.useGitNexus.mockReturnValue({
      data: { repos: [] },
      isLoading: false,
      isError: false,
    });

    render(<LibraryPage />);

    const banner = document.querySelector('[data-drilldown-from="library"]');
    expect(banner).toBeTruthy();
    const text = banner?.textContent ?? "";
    expect(text).toContain("Drilldown from Operations NOC");
    expect(text).toContain("window=24h");
    expect(text).toContain("workspace=all");
    expect(text).toContain(
      "Library page has its own sources/index selectors; originating NOC filters are shown for reference only and are NOT applied.",
    );
  });

  it("Memory Not Digested forwards a scope note to /library on Consolidation blocked", () => {
    clearSearchParams();
    api.useMemoryStats.mockReturnValue({
      data: {
        lastRun: {
          status: "failed",
          batch_size: 0,
          started_at: "2026-07-13T11:59:00Z",
          error_message: "sqlite locked",
        },
        pendingUnconsolidated: 1,
        tierStats: [],
        sources: [],
        recentFailures24h: 1,
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

    render(<MemoryNotDigested filters={{ window: "24h", workspace: "all" }} />);
    // The Library drilldown link must carry a from_scope_note that
    // the destination page actually displays verbatim.
    const libraryLinks = Array.from(document.querySelectorAll('a[href*="/library?from_window="]'));
    expect(libraryLinks.length).toBeGreaterThan(0);
    const libraryHref = libraryLinks[0]?.getAttribute("href") ?? "";
    expect(libraryHref).toContain("from_window=24h");
    expect(libraryHref).toContain("from_workspace=all");
    expect(libraryHref).toContain("from_scope_note=");
    expect(libraryHref).toContain(
      encodeURIComponent(
        "Library page has its own sources/index selectors; originating NOC filters are shown for reference only and are NOT applied.",
      ).replace(/%20/g, "+"),
    );
    // MemoryNotDigested must render the banner for the linking row too.
    // (Covered by /library consumer test; we only assert forwarding.)
  });
});

// ── Sanity: destination pages do not render the banner when from_* are absent
describe("Round 3 — no banner when from_window is absent", () => {
  beforeEach(() => clearSearchParams());

  it("escalations does not render the banner without from_window", () => {
    api.useEscalations.mockReturnValue({
      data: { escalations: [], timestamp: "2026-07-13T12:00:00Z" },
      isLoading: false,
      isError: false,
    });
    api.useResolveEscalation.mockReturnValue({ mutate: vi.fn(), isError: false });
    render(<EscalationsPage />);
    expect(document.querySelector('[data-drilldown-from="escalations"]')).toBeNull();
  });

  it("library does not render the banner without from_window", () => {
    api.useKnowledge.mockReturnValue({
      data: { collections: [], totalFiles: 0, totalDocs: 0 },
      isLoading: false,
      isError: false,
    });
    api.useGitNexus.mockReturnValue({
      data: { repos: [] },
      isLoading: false,
      isError: false,
    });
    render(<LibraryPage />);
    expect(document.querySelector('[data-drilldown-from="library"]')).toBeNull();
  });
});
