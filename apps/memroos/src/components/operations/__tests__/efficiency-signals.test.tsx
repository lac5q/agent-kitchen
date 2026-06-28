import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EfficiencySignals } from "../efficiency-signals";

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
}));

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
            ...baseResponse.metrics.efficiency,
            tokenLedgerEvents: 0,
            rawContextTokens: 0,
            cachedTokens: 0,
            totalTokens: 0,
            rawContextTokenShare: null,
            streams: {
              ...baseResponse.metrics.efficiency.streams,
              token_ledger: 0,
            },
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<EfficiencySignals />);

    expect(screen.getByText(/^degraded$/i)).toBeInTheDocument();
    expect(screen.getByText(/missing raw-context token ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/raw-context ingest token share/i)).toBeInTheDocument();
    expect(screen.getByText(/no token ledger events/i)).toBeInTheDocument();
  });
});
