import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BehaviorSignals } from "../behavior-signals";
import { EfficiencySignals } from "../efficiency-signals";
import { MemoryNotDigested } from "../memory-not-digested";
import { ModelUtility } from "../model-utility";
import { SkillsLifecycle } from "../skills-lifecycle";

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
