"use client";

import { useOperationsNoc, type OperationsNocEfficiencyMetrics } from "@/lib/api-client";
import type { NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { Eyebrow, PillBtn } from "./noc-primitives";

const EMPTY_RECOLLECTION_METRICS: OperationsNocEfficiencyMetrics["recollection"] = {
  totalDecisions: 0,
  searchRequired: 0,
  searchSkipped: 0,
  injectedMemories: 0,
  ignoredCandidates: 0,
  policyDeniedCandidates: 0,
  belowThresholdCandidates: 0,
  skipReasons: {},
  beliefStageCounts: {
    bronze_raw_source: 0,
    silver_candidate_claim: 0,
    gold_operational_truth: 0,
  },
  relianceCounts: {
    direct_truth: 0,
    caveated_claim: 0,
    source_evidence_only: 0,
  },
  latestDecisions: [],
};

const EMPTY_METRICS: OperationsNocEfficiencyMetrics = {
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
  recollection: EMPTY_RECOLLECTION_METRICS,
  streams: {
    retrieval_trace: 0,
    source_read: 0,
    token_ledger: 0,
    operator_question: 0,
    memory_write: 0,
  },
  lastUpdated: null,
};

function formatPercent(value: number | null) {
  if (value === null) return "No events";
  return `${Math.round(value * 100)}%`;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function badgeColors(status: string) {
  if (status === "live") {
    return { background: NOC.successBg, color: NOC.success };
  }
  if (status === "degraded" || status === "loading") {
    return { background: NOC.warnBg, color: NOC.warn };
  }
  return { background: NOC.peach, color: NOC.terra };
}

function normalizeMetrics(metrics: OperationsNocEfficiencyMetrics): OperationsNocEfficiencyMetrics {
  return {
    ...metrics,
    recollection: metrics.recollection ?? EMPTY_RECOLLECTION_METRICS,
  };
}


type CardState = "live" | "gap" | "blocked";

interface CardDescriptor {
  name: string;
  value: string;
  detail: string;
  state: CardState;
  hasMeasurement: boolean;
}

// Build a single efficiency card without ever substituting a fabricated 0
// for a non-live envelope. A non-live card reports a non-numeric value
// (`—` / `no data`) and `hasMeasurement: false`.
function buildCard({
  name,
  value,
  detail,
  hasMeasurement,
  reasonIfMissing,
}: {
  name: string;
  value: string;
  detail: string;
  hasMeasurement: boolean;
  reasonIfMissing?: string;
}): CardDescriptor {
  if (hasMeasurement) {
    return { name, value, detail, state: "live", hasMeasurement: true };
  }
  return {
    name,
    value: "—",
    detail: reasonIfMissing ?? detail,
    state: "blocked",
    hasMeasurement: false,
  };
}

function buildCards(metrics: OperationsNocEfficiencyMetrics): CardDescriptor[] {
  return [
    buildCard({
      name: "Retrieval calls before useful work",
      value: formatPercent(metrics.retrievalBeforeWorkRate),
      detail:
        metrics.retrievalEvents > 0
          ? `${metrics.retrievalUsedInFirstResponse} of ${metrics.retrievalEvents} retrievals used in first response`
          : "No retrieval trace events",
      hasMeasurement: metrics.streams.retrieval_trace > 0,
      reasonIfMissing: "Retrieval trace stream missing — value withheld",
    }),
    buildCard({
      name: "Same-source re-read count",
      value: plural(metrics.repeatedSourceReads, "reread"),
      detail:
        metrics.sourceReadEvents > 0
          ? `${metrics.sourceReadEvents} source reads in selected window`
          : "No source-read events",
      hasMeasurement: metrics.streams.source_read > 0,
      reasonIfMissing: "Source-read stream missing — value withheld",
    }),
    buildCard({
      name: "Raw-context ingest token share",
      value: formatPercent(metrics.rawContextTokenShare),
      detail:
        metrics.tokenLedgerEvents > 0
          ? `${metrics.rawContextTokens} raw of ${metrics.totalTokens} total tokens`
          : "No token ledger events",
      hasMeasurement: metrics.streams.token_ledger > 0,
      reasonIfMissing: "Token ledger stream missing — value withheld",
    }),
    buildCard({
      name: "Operator re-ask redundancy",
      value: plural(metrics.operatorReasks, "re-ask"),
      detail:
        metrics.operatorQuestions > 0
          ? `${formatPercent(metrics.operatorReaskRate)} of ${metrics.operatorQuestions} questions repeat prior answers`
          : "No operator-question events",
      hasMeasurement: metrics.streams.operator_question > 0,
      reasonIfMissing: "Operator-question stream missing — value withheld",
    }),
    buildCard({
      name: "Rediscovered-fact rate",
      value: plural(metrics.rediscoveredWrites, "rediscovery", "rediscoveries"),
      detail:
        metrics.memoryWrites > 0
          ? `${formatPercent(metrics.rediscoveredFactRate)} of ${metrics.memoryWrites} memory writes rediscovered existing facts`
          : "No memory-write events",
      hasMeasurement: metrics.streams.memory_write > 0,
      reasonIfMissing: "Memory-write stream missing — value withheld",
    }),
    buildCard({
      name: "Recollection decisions",
      value:
        metrics.recollection.totalDecisions > 0
          ? `${metrics.recollection.searchRequired} required / ${metrics.recollection.searchSkipped} skipped`
          : "No decisions",
      detail:
        metrics.recollection.totalDecisions > 0
          ? `${metrics.recollection.beliefStageCounts.gold_operational_truth} gold · ${metrics.recollection.beliefStageCounts.silver_candidate_claim} silver · ${metrics.recollection.policyDeniedCandidates} denied`
          : "No recollection receipts",
      hasMeasurement: metrics.recollection.totalDecisions > 0 && metrics.streams.retrieval_trace > 0,
      reasonIfMissing: "No retrieval traces — recollection decision value withheld",
    }),
  ];
}
export function EfficiencySignals({ filters }: { filters?: NocFilters }) {
  const noc = useOperationsNoc(filters);
  const envelope = noc.data?.metrics.efficiency;
  const metrics = normalizeMetrics(envelope?.value ?? EMPTY_METRICS);
  const panel = noc.data?.panels.efficiency;
  const status = noc.isLoading
    ? "loading"
    : noc.isError
      ? "degraded"
      : (envelope?.status ?? panel?.status ?? "empty");
  const statusColors = badgeColors(status);
  const warnings = noc.isError
    ? ["Unable to load efficiency telemetry"]
    : envelope && envelope.status !== "live" && envelope.status !== "zero"
      ? [envelope.reason ?? "Efficiency telemetry unavailable"]
      : panel?.warnings ?? ["No efficiency telemetry events in the selected window"];
  const cards = buildCards(metrics);

  return (
    <div style={{ padding: "0 28px 14px" }}>
      <div
        style={{
          background: NOC.paper,
          border: `1px solid ${NOC.rule}`,
        }}
      >
        {/* Header row */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${NOC.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: NOC.ink }}>
            Efficiency signals · is memory actually paying off?
          </div>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "2px 6px",
              background: statusColors.background,
              color: statusColors.color,
              border: `1px solid ${statusColors.background}`,
              textTransform: "uppercase",
              fontFamily: NOC_FONT_MONO,
            }}
          >
            {status}
          </span>
          <span style={{ fontSize: 11.5, color: NOC.soft }}>
            {metrics.totalEvents > 0
              ? `${metrics.totalEvents} efficiency events from ${panel?.source ?? "efficiency_events"}`
              : warnings[0]}
          </span>
          <div style={{ marginLeft: "auto" }}>
            <PillBtn href="/evals">Open telemetry plan</PillBtn>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {cards.map((item, i) => (
            <div
              key={item.name}
              style={{
                padding: "14px 14px 13px",
                borderRight: i < cards.length - 1 ? `1px solid ${NOC.rule}` : "none",
                display: "flex",
                flexDirection: "column",
                gap: 9,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >

                <Eyebrow>{item.name}</Eyebrow>
                <span
                  style={{
                    fontFamily: NOC_FONT_MONO,
                    fontSize: 10,
                    fontWeight: 700,
                    color:
                      item.state === "live"
                        ? NOC.success
                        : item.state === "blocked"
                          ? NOC.warn
                          : NOC.terra,
                    background:
                      item.state === "live"
                        ? NOC.successBg
                        : item.state === "blocked"
                          ? NOC.warnBg
                          : NOC.peach,
                    padding: "2px 6px",
                    flexShrink: 0,
                    textTransform: "uppercase",
                  }}
                  data-card-state={item.state}
                >
                  {item.state === "live" ? "live" : "no source"}
                </span>              </div>
              <div
                style={{
                  fontFamily: NOC_FONT_MONO,
                  fontSize: 24,
                  color: NOC.ink,
                  lineHeight: 1,
                  fontWeight: 700,
                }}
              >
                {item.value}
              </div>
              <div style={{ fontSize: 11.5, color: NOC.soft, lineHeight: 1.45 }}>
                {item.detail}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${NOC.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: NOC.fog,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: NOC_FONT_MONO,
              color: NOC.terra,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            {warnings.length > 0 ? "HONEST STATE" : "LIVE READ MODEL"}
          </span>
          <span style={{ fontSize: 12, color: NOC.muted }}>
            {warnings.length > 0
              ? warnings.join(" · ")
              : "All five Phase 117 efficiency streams are present in the selected window."}
          </span>
        </div>
      </div>
    </div>
  );
}
