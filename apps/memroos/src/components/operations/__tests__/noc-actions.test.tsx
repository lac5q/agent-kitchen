import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttentionPanel } from "../attention-panel";
import { BehaviorSignals } from "../behavior-signals";
import { EfficiencySignals } from "../efficiency-signals";
import { AgentActivityPanel } from "../index";
import { MemoryNotDigested } from "../memory-not-digested";
import { ModelUtility } from "../model-utility";
import { SkillsLifecycle } from "../skills-lifecycle";

const noc = vi.hoisted(() => ({
  attention: [] as Array<Record<string, unknown>>,
  agentActivity: {
    sourceState: "no_history" as string,
    source: "sqlite://messages",
    observedAt: null as string | null,
    agents: [] as Array<Record<string, unknown>>,
    delegations: [] as Array<Record<string, unknown>>,
  },
  sourceStates: {
    attention: "live" as "live" | "stale_or_error",
    agentActivity: "no_history" as string,
    efficiencySignals: "known_unwired" as const,
  },
  isLoading: false,
  isError: false,
}));

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
      agentActivity: noc.agentActivity,
      sourceStates: noc.sourceStates,
      // Default NOC omits efficiency; EfficiencySignals tests still render the
      // advanced component against an empty local fallback.
      panels: {},
      metrics: {},
    },
    isLoading: noc.isLoading,
    isError: noc.isError,
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
  it("links only to available operator pages", () => {
    noc.isLoading = false;
    noc.isError = false;
    noc.sourceStates.attention = "live";
    noc.attention = [
      { id: "cron", severity: "critical", title: "Cron needs attention", detail: "failed", timestamp: "2026-07-20T12:00:00.000Z", target: null },
      { id: "hil", severity: "warning", title: "Pending HIL review", detail: null, timestamp: "2026-07-20T11:00:00.000Z", target: "/escalations" },
      { id: "security", severity: "critical", title: "Security finding", detail: null, timestamp: "2026-07-20T11:00:00.000Z", target: "/audit" },
      { id: "source", severity: "info", title: "Source freshness needs attention", detail: null, timestamp: "2026-07-20T11:00:00.000Z", target: "/library" },
    ];
    render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText("Cron needs attention")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open" }).map((link) => link.getAttribute("href"))).toEqual(["/escalations", "/audit", "/library"]);
    expect(document.querySelectorAll("[data-attention-severity='critical']")).toHaveLength(2);
    expect(screen.getByLabelText("Attention")).toBeInTheDocument();
  });

  it("renders the explicit all-clear state only after live data", () => {
    noc.isLoading = false;
    noc.isError = false;
    noc.sourceStates.attention = "live";
    noc.attention = [];
    render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText(/all clear — no cron failures/i)).toBeInTheDocument();
    expect(document.querySelector("[data-status='all-clear']")).toBeInTheDocument();
    expect(screen.getByText(/0 items/i)).toBeInTheDocument();
  });

  it("does not render all-clear while loading or when a source failed", () => {
    noc.attention = [];
    noc.isLoading = true;
    noc.isError = false;
    noc.sourceStates.attention = "live";
    const { unmount } = render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelector("[data-status='loading']")).toBeInTheDocument();
    expect(document.querySelector("[data-status='all-clear']")).not.toBeInTheDocument();
    unmount();

    noc.isLoading = false;
    noc.isError = false;
    noc.sourceStates.attention = "stale_or_error";
    render(<AttentionPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelector("[data-status='source-error']")).toBeInTheDocument();
    expect(document.querySelector("[data-status='all-clear']")).not.toBeInTheDocument();
  });
});

describe("Phase 173 Agent Activity", () => {
  it("surfaces message-backed activity without requiring hive rows", () => {
    noc.agentActivity = {
      sourceState: "live",
      source: "sqlite://messages",
      observedAt: "2026-07-20T12:00:00.000Z",
      agents: [
        {
          agentId: "codex",
          messageCount: 3,
          sessionCount: 2,
          lastMessageAt: "2026-07-20T12:00:00.000Z",
        },
      ],
      delegations: [],
    };
    noc.sourceStates = { agentActivity: "live", efficiencySignals: "known_unwired" };

    render(<AgentActivityPanel filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByTestId("agent-activity-panel")).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
    expect(screen.getByText(/3 msg · 2 ses/i)).toBeInTheDocument();
    expect(screen.queryByText(/delegations/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-agent-activity="live"]')).toBeInTheDocument();
  });
});
