import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EfficiencySignals } from "../efficiency-signals";

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
}));

const innerMetrics = {
  totalEvents: 9,
  retrievalEvents: 2,
  retrievalUsedInFirstResponse: 1,
  retrievalBeforeWorkRate: 0.5,
  sourceReadEvents: 2,
  repeatedSourceReads: 1,
  tokenLedgerEvents: 1,
  rawContextTokens: 30,
  cachedTokens: 10,
  totalTokens: 100,
  rawContextTokenShare: 0.3,
  operatorQuestions: 2,
  operatorReasks: 1,
  operatorReaskRate: 0.5,
  memoryWrites: 2,
  rediscoveredWrites: 1,
  rediscoveredFactRate: 0.5,
  recollection: {
    totalDecisions: 2,
    searchRequired: 1,
    searchSkipped: 1,
    injectedMemories: 2,
    ignoredCandidates: 1,
    policyDeniedCandidates: 1,
    belowThresholdCandidates: 0,
    skipReasons: {
      "Task is local or mechanical with no stable recall dependency.": 1,
    },
    beliefStageCounts: {
      bronze_raw_source: 0,
      silver_candidate_claim: 1,
      gold_operational_truth: 1,
    },
    relianceCounts: {
      direct_truth: 1,
      caveated_claim: 1,
      source_evidence_only: 0,
    },
    latestDecisions: [
      {
        id: 2,
        taskId: "task-live",
        agentId: "codex",
        decision: "search_skipped",
        timing: "before_plan",
        reasons: ["low_memory_need", "no_stable_entities"],
        skipReason: "Task is local or mechanical with no stable recall dependency.",
        createdAt: "2026-06-27T12:00:00Z",
      },
    ],
  },
  streams: {
    retrieval_trace: 2,
    source_read: 2,
    token_ledger: 1,
    operator_question: 2,
    memory_write: 2,
  },
};

const baseResponse = {
  panels: {
    efficiency: {
      status: "live",
      source: "efficiency_events",
      lastUpdated: "2026-06-27T12:00:00Z",
      warnings: [],
    },
  },
  metrics: {
    efficiency: {
      value: innerMetrics,
      status: "live",
      source: "durable://efficiency_events",
      observedAt: "2026-06-27T12:00:00Z",
      freshnessMs: 0,
      scope: { window: "24h", workspace: "all" },
      reason: "All 5 efficiency streams produced events in the selected window",
    },
  },
};

describe("EfficiencySignals", () => {
  it("renders live NOC efficiency metrics without sample placeholders", () => {
    api.useOperationsNoc.mockReturnValue({ data: baseResponse, isLoading: false, isError: false });

    render(<EfficiencySignals />);

    expect(screen.getAllByText(/^live$/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/retrieval calls before useful work/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1 reread")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("1 rediscovery")).toBeInTheDocument();
    expect(screen.getByText(/recollection decisions/i)).toBeInTheDocument();
    expect(screen.getByText("1 required / 1 skipped")).toBeInTheDocument();
    expect(screen.queryByText(/missing telemetry/i)).not.toBeInTheDocument();
    expect(screen.queryByText("3.2")).not.toBeInTheDocument();
  });


  it("renders degraded stream gaps honestly", () => {
    api.useOperationsNoc.mockReturnValue({
      data: {
        ...baseResponse,
        panels: {
          efficiency: {
            status: "degraded",
            source: "efficiency_events",
            lastUpdated: "2026-06-27T12:00:00Z",
            warnings: ["Missing raw-context token ledger"],
          },
        },
        metrics: {
          efficiency: {
            value: null,
            status: "degraded",
            source: "durable://efficiency_events",
            observedAt: "2026-06-27T12:00:00Z",
            freshnessMs: 1500,
            scope: { window: "24h", workspace: "all" },
            reason: "Missing 1/5 efficiency streams: raw-context token ledger",
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<EfficiencySignals />);

    expect(screen.getByText(/^degraded$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/missing .*raw-context token ledger/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/raw-context ingest token share/i)).toBeInTheDocument();
    // Non-live cards must NOT render numeric zeros.
    expect(screen.queryByText(/^0 reread/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^0 rediscovery/i)).not.toBeInTheDocument();
  });

  it("does not fabricate numeric values when the envelope value is null", () => {
    // Source has zero events of every stream; envelope is empty. The card
    // values must not display "0 reread" / "0 rediscovery" / "0 re-ask"
    // since there is no successful measurement to prove them.
    api.useOperationsNoc.mockReturnValue({
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
            value: null,
            status: "empty",
            source: "durable://efficiency_events",
            observedAt: null,
            freshnessMs: null,
            scope: { window: "24h", workspace: "all" },
            reason: "Healthy source has no efficiency telemetry events in the selected window",
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    const { container } = render(<EfficiencySignals />);

    // Each card whose underlying stream is absent must show "—" and a "no source" badge.
    const blockedBadges = container.querySelectorAll('[data-card-state="blocked"]');
    expect(blockedBadges.length).toBeGreaterThan(0);
    // No card displays a numeric "0" value placeholder.
    expect(container.textContent).not.toMatch(/\b0 reread/i);
    expect(container.textContent).not.toMatch(/\b0 re-asks?\b/i);
    expect(container.textContent).not.toMatch(/\b0 rediscover/i);
  });
});