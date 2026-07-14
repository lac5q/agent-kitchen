"use client";


import { useMemo, useState } from "react";import { Spark } from "@/components/shared/charts";
import {
  useDelegations,
  useHiveFeed,
  useModelUsage,
  useOperationsNoc,
} from "@/lib/api-client";

import { describeMetricEnvelope, metricEnvelope, type MetricEnvelope } from "@/lib/metric-status";import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { nocWindowToSinceIso, type NocFilters } from "@/lib/noc-filters";
import {
  Eyebrow,
  formatFreshness,
  formatObservedAt,
  Mono,
  SourceStatusBadge,
} from "./noc-primitives";

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function envelopeToValueLabel(env: MetricEnvelope<number>): string {
  if (env.status === "live" || env.status === "zero") {
    if (env.value === null || !Number.isFinite(env.value)) return "—";
    return compactNumber(env.value);
  }
  if (env.status === "empty") return "no data";
  if (env.status === "stale") return "stale";
  if (env.status === "blocked") return "blocked";
  if (env.status === "unavailable") return "no source";
  if (env.status === "degraded") return "partial";
  return "error";
}

function envelopeToSparkColor(env: MetricEnvelope<number>, fallback: string): string {
  if (env.status === "live") return NOC.ink;
  if (env.status === "zero") return NOC.success;
  if (env.status === "empty") return NOC.cold;
  if (env.status === "error") return NOC.terra;
  if (env.status === "blocked" || env.status === "unavailable") return NOC.warn;
  if (env.status === "stale" || env.status === "degraded") return NOC.warn;
  return fallback;
}

interface PulseStripProps {
  filters: NocFilters;
}


function computeFreshnessMs(observedAt: string | null, nowMs: number): number | null {
  if (!observedAt) return null;
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}

export function PulseStrip({ filters }: PulseStripProps) {

  const since = useMemo(() => nocWindowToSinceIso(filters.window), [filters.window]);
  // Capture "now" once when filters change so Date.now() is not invoked
  // during the modelTokensEnvelope memo body. useState initializer is the
  // canonical pattern for reading current time on first render.
  const [nowMs] = useState(() => Date.now());
  const noc = useOperationsNoc(filters);  const hive = useHiveFeed(200);
  const delegations = useDelegations(200);
  const modelUsage = useModelUsage(since);
  const metrics = noc.data?.metrics;
  const envelopes = {
    memoryRows: metrics?.memoryRows,
    activeDispatches: metrics?.activeDispatches,
    failedWork: metrics?.failedWork,
    governanceEvents: metrics?.governanceEvents,
    enabledSkills: metrics?.enabledSkills,
    cronWarnings: metrics?.cronWarnings,
  };


  const modelUsageEmpty = !modelUsage.isLoading && (modelUsage.data?.usage.models.length ?? 0) === 0;  const totalUsage = modelUsage.data?.usage.total;
  const tokenTotal =
    totalUsage && (totalUsage.inputTokens + totalUsage.outputTokens + totalUsage.cacheRead) > 0
      ? totalUsage.inputTokens + totalUsage.outputTokens + totalUsage.cacheRead
      : null;




  // Build a truthful envelope from /api/model-usage so this card reconciles
  // with the API instead of always rendering an em dash. Freshness is
  // computed via a pure helper (no Date.now() inside the memoized body).
  const modelTokensEnvelope: MetricEnvelope<number> = useMemo(() => {
    const ts = modelUsage.data?.timestamp ?? null;
    const freshnessMs = computeFreshnessMs(ts, nowMs);
    // Finding (4): /api/model-usage does NOT partition by workspace.
    // The envelope MUST advertise scope.workspace='all' so the card
    // does not falsely label local/remote partitions it does not
    // actually query. The card subline further discloses this.
    const modelTokensScope = { window: filters.window, workspace: "all" as const };
    if (modelUsage.isError) {
      return metricEnvelope<number>({
        value: null,
        status: "error",
        source: "/api/model-usage",
        observedAt: null,
        freshnessMs: null,
        scope: modelTokensScope,
        reason:
          modelUsage.error instanceof Error
            ? `Failed to load /api/model-usage: ${modelUsage.error.message}. workspace=${filters.workspace} filter is NOT applied (model-usage is windowed only).`
            : "Failed to load /api/model-usage",
      });
    }
    if (modelUsage.isLoading || !modelUsage.data) {
      return metricEnvelope<number>({
        value: null,
        status: "blocked",
        source: "/api/model-usage",
        observedAt: null,
        freshnessMs: null,
        scope: modelTokensScope,
        reason: `Loading /api/model-usage. workspace=${filters.workspace} filter is NOT applied (model-usage is windowed only).`,
      });
    }
    const usage = modelUsage.data.usage;
    const sum = usage.total.inputTokens + usage.total.outputTokens + usage.total.cacheRead;
    if (modelUsageEmpty || sum === 0) {
      return metricEnvelope<number>({
        value: null,
        status: "empty",
        source: "/api/model-usage",
        observedAt: ts,
        freshnessMs,
        scope: modelTokensScope,
        reason: `Healthy /api/model-usage returned no token usage in ${filters.window}. workspace=${filters.workspace} filter is NOT applied (model-usage is windowed only).`,
      });
    }
    return metricEnvelope<number>({
      value: sum,
      status: "live",
      source: "/api/model-usage",
      observedAt: ts,
      freshnessMs,
      scope: modelTokensScope,
      reason: `Sum of input+output+cacheRead tokens from /api/model-usage since=${since}. workspace=${filters.workspace} filter is NOT applied (model-usage is windowed only).`,
    });

  }, [
    modelUsage,
    modelUsageEmpty,
    nowMs,
    filters.window,
    filters.workspace,
    since,
  ]);

  // Pull observed time from hive/delegations for spark context only.
  const actions = hive.data?.actions ?? [];  const delegationRows = delegations.data?.delegations ?? [];
  const errorSpark = actions.slice(0, 12).reverse().map((a) => (a.action_type === "error" ? 1 : 0));
  const dispatchSpark = delegationRows.slice(0, 12).reverse().map((d) => (d.status === "active" ? 2 : 1));
  const modelTokensSpark = (() => {
    const series = modelUsage.data?.usage.models.slice(0, 12).map((m) => m.totalTokens) ?? [];
    if (series.length >= 2) return series;
    if (tokenTotal !== null) return [0, tokenTotal];
    return [];
  })();

  const cards: Array<{
    label: string;
    env?: MetricEnvelope<number>;
    fallback?: string;
    color: string;
    spark: number[];
    subline?: string;
  }> = [
    {
      label: "Hive actions (window)",
      env: envelopes.memoryRows,
      color: NOC.ink,
      spark: actions.slice(0, 12).reverse().map((_, i) => i + 1),
      subline: `Memory rows counted for window=${filters.window}, workspace=${filters.workspace}`,
    },
    {
      label: "Active dispatches",
      env: envelopes.activeDispatches,
      color: NOC.terra,
      spark: dispatchSpark,
      subline: "Active, pending, or paused hive delegations (current snapshot)",
    },
    {
      label: "Memory rows",
      env: envelopes.memoryRows,
      color: NOC.ink,
      spark: actions.slice(0, 12).reverse().map(() => 0),
      subline: "Direct memory rows counted from SQLite messages",
    },
    {
      label: `Model tokens · ${filters.window}`,
      env: modelTokensEnvelope,
      color: modelTokensEnvelope.status === "live" ? NOC.success : NOC.terra,
      spark: modelTokensSpark,
      subline: `from /api/model-usage?since=${since}. workspace=${filters.workspace} NOT applied (model-usage is windowed only).`,
    },
    {
      label: "Savings baseline",
      env: undefined,
      color: NOC.warn,
      spark: [0, 0],
      subline: "Baseline savings are explicitly blocked until a retained-memory baseline exists",
    },
    {
      label: "Failed work",
      env: envelopes.failedWork,
      color: NOC.terra,
      spark: errorSpark,
      subline: "Failed hive delegations counted across all tenants",
    },
  ];
  return (
    <div style={{ padding: "0 28px 14px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 8,
        }}
      >
        {cards.map((card) => {
          const env = card.env;
          const live = env ? env.status === "live" || env.status === "zero" : false;
          const valueText = env ? envelopeToValueLabel(env) : (card.fallback ?? "—");
          const sparkColor = env ? envelopeToSparkColor(env, card.color) : card.color;
          const sparkPoints = live && env && typeof env.value === "number"
            ? card.spark.length >= 2 ? card.spark : [0, env.value]
            : card.spark.length >= 2 ? card.spark : [0, 0];
          const state = env ? describeMetricEnvelope(env).label : "no source";
          return (
            <div
              key={card.label}
              style={{
                background: NOC.paper,
                border: `1px solid ${NOC.rule}`,
                minWidth: 0,
                padding: 12,
              }}
              data-card-label={card.label}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Eyebrow>{card.label}</Eyebrow>
                {env && <SourceStatusBadge status={env.status} />}
                {!env && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      padding: "2px 6px",
                      background: NOC.warnBg,
                      color: NOC.warn,
                      textTransform: "uppercase",
                      
                      fontFamily: NOC_FONT_MONO,
                      whiteSpace: "nowrap",
                    }}
                    data-status="no-source"
                  >
                    {state}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginTop: 4,
                }}
              >
                <Mono size={22} color={card.color}>
                  {valueText}
                </Mono>
                {env && env.status === "zero" && (
                  <span
                    style={{
                      fontFamily: NOC_FONT_MONO,
                      fontSize: 11,
                      fontWeight: 600,
                      color: NOC.success,
                      padding: "1px 5px",
                      background: NOC.successBg,
                    }}
                  >
                    measured zero
                  </span>
                )}
              </div>
              <div style={{ marginTop: 6 }}>
                <Spark values={sparkPoints} color={sparkColor} w={180} h={24} fill />
              </div>
              {env && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10.5,
                    color: NOC.soft,
                    fontFamily: NOC_FONT_MONO,
                    lineHeight: 1.45,
                    overflowWrap: "anywhere",
                  }}
                >
                  <div>
                    source: <span style={{ color: NOC.muted }}>{env.source}</span>
                  </div>
                  {env.status !== "live" && env.status !== "zero" && env.reason && (
                    <div style={{ color: NOC.terra }}>{env.reason}</div>
                  )}
                  <div>
                    observed: {formatObservedAt(env.observedAt)} · age {formatFreshness(env.freshnessMs)}
                  </div>
                </div>
              )}
              {!env && card.subline && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10.5,
                    color: NOC.soft,
                    fontFamily: NOC_FONT_MONO,
                    lineHeight: 1.45,
                  }}
                >
                  {card.subline}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {noc.isError && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: NOC.peach,
            border: `1px solid ${NOC.peach}`,
            color: NOC.terra,
            fontSize: 12,
          }}
        >
          Failed to load /api/operations/noc. The pulse strip is rendering each card from its own source where available; missing envelopes are flagged honestly above.
        </div>
      )}
    </div>
  );
}
