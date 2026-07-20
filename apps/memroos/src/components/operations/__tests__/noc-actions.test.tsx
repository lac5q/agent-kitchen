import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttentionPanel } from "../attention-panel";
import { BehaviorSignals } from "../behavior-signals";
import { EfficiencySignals } from "../efficiency-signals";
import { MemoryNotDigested } from "../memory-not-digested";
import { ModelUtility } from "../model-utility";
import { SkillsLifecycle } from "../skills-lifecycle";

const noc = vi.hoisted(() => ({ attention: [] as Array<Record<string, unknown>> }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-client", () => ({
  useMemoryStats: () => ({
    data: {
      lastRun: {
        started_at: "2026-05-21T11:59:00Z",
        completed_at: "2026-05-21T12:00:00Z",
        batch_size: 4,
        insights_written: 1,
        status: "completed",
        error_message: null,
      },
      pendingUnconsolidated: 2,
      tierStats: [],
      sources: [{ agent_id: "sophia", cnt: 3 }],
      recentFailures24h: 0,
      timestamp: "2026-05-21T12:00:00Z",
    },
    isError: false,
  }),
  useMemoryTierHealth: () => ({
    data: { tiers: [], timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  }),
  useModelUsage: () => ({
    data: {
      usage: {
        models: [
          {
            id: "claude-sonnet",
            name: "claude-sonnet",
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 0,
            cacheCreation: 0,
            requests: 3,
            totalTokens: 150,
          },
        ],
        total: {
          inputTokens: 100,
          outputTokens: 50,
          cacheRead: 0,
          cacheCreation: 0,
          requests: 3,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
  useSealProposals: () => ({
    data: { proposals: [{ id: "p1" }], timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  }),
  useSecurityReport: () => ({
    data: { summary: { highSeverity: 1, blockedAttempts: 0, securityEvents: 1 } },
    isError: false,
  }),
  useEscalations: () => ({
    data: { escalations: [{ id: "e1", status: "open" }], timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  }),
  useSkills: () => ({
    data: {
      totalSkills: 2,
      coverageGaps: ["old-skill"],
      skillBudget: { duplicateSkills: [] },
      skillDetails: [
        {
          name: "incident-review",
          title: "Incident Review",
          path: "/skills/incident-review/SKILL.md",
          stage: "agent-limited",
          reviewStatus: "unreviewed",
          health: "coverage-gap",
          approvedAt: null,
        },
      ],
    },
    isError: false,
  }),
  useModelRoutingDashboard: () => ({
    data: { events: [{ success: false }], timestamp: "2026-05-21T12:00:00Z" },
    isError: false,
  }),
  useOperationsNoc: () => ({
    data: {
      attention: noc.attention,
      panels: {
        efficiency: {
          status: "empty",
          source: "efficiency_events",
          lastUpdated: null,
          warnings: ["No efficiency telemetry events in the selected window"],
        },
      },
      metrics: {
        efficiency: {
          totalEvents: 0,
          retrievalEvents: 0,
          retrievalUsedInFirstResponse: 0,
          retrievalBeforeWorkRate: null,
          sourceReadEvents: 0,
          repeatedSourceReads: 0,
          tokenLedgerEvents: 0,
          rawContextTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          rawContextTokenShare: null,
          operatorQuestions: 0,
          operatorReasks: 0,
          operatorReaskRate: null,
          memoryWrites: 0,
          rediscoveredWrites: 0,
          rediscoveredFactRate: null,
          streams: {
            retrieval_trace: 0,
            source_read: 0,
            token_ledger: 0,
            operator_question: 0,
            memory_write: 0,
          },
          lastUpdated: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

describe("NOC actions", () => {
  it("routes telemetry, investigation, model, and SEAL actions to real product surfaces", () => {
    render(
      <>
        <EfficiencySignals />
        <MemoryNotDigested />
        <ModelUtility />
        <SkillsLifecycle />
      </>
    );

    // /evals link from EfficiencySignals: top-level navigation, not a
    // drilldown from BehaviorSignals or MemoryNotDigested, so the bare
    // href is acceptable (no scope forwarding required for finding 7).
    expect(screen.getByRole("link", { name: /open telemetry plan/i })).toHaveAttribute("href", "/evals");
    // Finding (7): drilldown links from Memory Not Digested must carry
    // the originating window/workspace so destinations can disclose the
    // scope. The Investigate link is now /notebooks?from_window=24h...
    expect(screen.getAllByRole("link", { name: /investigate/i })[0]).toHaveAttribute(
      "href",
      "/notebooks?from_window=24h&from_workspace=all&from_scope_note=" +
        new URLSearchParams({
          from_scope_note:
            "Memory page has its own filters; originating NOC filters are shown for reference only and are NOT applied.",
        }).toString().replace(/^from_scope_note=/, "")
    );
    expect(screen.getByRole("link", { name: /re-route/i })).toHaveAttribute("href", "/ledger");
    expect(screen.getByRole("link", { name: /seal proposals/i })).toHaveAttribute("href", "/seal");
    expect(screen.getByRole("link", { name: /promote candidate/i })).toHaveAttribute("href", "/skills");
  });

  it("lets operators dismiss a behavior signal instead of rendering dead dismiss buttons", () => {
    render(<BehaviorSignals />);

    expect(screen.getByText(/high-severity security events/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    expect(screen.queryByText(/high-severity security events/i)).not.toBeInTheDocument();
    expect(screen.getByText(/4 visible/i)).toBeInTheDocument();
  });
});



describe("Round 4 blocking fixes — Seal drilldown navigation", () => {
  it("[F2] /seal drilldown renders a plain anchor with /seal href (GET-only navigation)", () => {
    // Round 4 [F2]: the SEAL proposals link must use a plain <a>
    // tag with href="/seal" so the browser performs a full GET
    // navigation. Previous <Link href> behaviour could stall the
    // click in production (the request fired but the URL never
    // updated). We assert both the role/link affordance and the
    // data attribute that PillBtn emits to mark anchor navigation.
    render(<SkillsLifecycle />);

    const sealLink = screen.getByRole("link", { name: /seal proposals/i });
    expect(sealLink).toHaveAttribute("href", "/seal");
    expect(sealLink.getAttribute("data-navigation-element")).toBe("anchor");
    expect(sealLink.getAttribute("data-pill-href")).toBe("/seal");
    // Anchor must be a real <a> tag (not a <button> or <Link>
    // wrapper), so we can rely on browser-native navigation.
    expect(sealLink.tagName.toLowerCase()).toBe("a");
  });

  it("[F2] every NOC drilldown Pill renders an anchor (no Link dependency)", () => {
    // Cross-check: the EfficiencySignals, ModelUtility, and
    // SkillsLifecycle drilldown PillBtns must all use plain anchors
    // so get-only click navigation is reliable for each route.
    render(
      <>
        <EfficiencySignals />
        <ModelUtility />
        <SkillsLifecycle />
      </>
    );

    for (const label of [/open telemetry plan/i, /re-route/i, /seal proposals/i, /promote candidate/i]) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("data-navigation-element")).toBe("anchor");
      expect(link.tagName.toLowerCase()).toBe("a");
    }
  });
});


describe("Phase 173 Attention", () => {
  it("renders severity rows with existing route targets", () => {
    noc.attention = [
      { id: "critical", severity: "critical", title: "Cron needs attention", detail: "failed", timestamp: "2026-07-20T12:00:00.000Z", target: "/api/cron-health" },
      { id: "warning", severity: "warning", title: "Pending HIL review", detail: null, timestamp: "2026-07-20T11:00:00.000Z", target: "/escalations" },
    ];
    render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText("Cron needs attention")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/api/cron-health");
    expect(document.querySelectorAll("[data-attention-severity='critical']")).toHaveLength(1);
  });

  it("renders the explicit all-clear state", () => {
    noc.attention = [];
    render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText(/all clear — no cron failures/i)).toBeInTheDocument();
    expect(document.querySelector("[data-status='all-clear']")).toBeInTheDocument();
  });
});
