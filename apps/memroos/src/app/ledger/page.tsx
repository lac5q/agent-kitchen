"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTokenStats, useModelUsage } from "@/lib/api-client";
import { SavingsChart } from "@/components/ledger/savings-chart";
import { ModelMixChart } from "@/components/ledger/model-mix-chart";
import { CostCalculator } from "@/components/ledger/cost-calculator";
import { LedgerAnalyticsPanel } from "@/components/ledger/analytics-panel";
import { ModelRoutingPanel } from "@/components/ledger/model-routing-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, PageHeader, Stat } from "@/components/shared/ui";
import { metricEnvelope, type MetricEnvelope } from "@/lib/metric-status";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

type NumberEnvelope = MetricEnvelope<number>;

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function envelopeBadge(env: NumberEnvelope): { label: string; background: string; color: string } {
  if (env.status === "live") return { label: "live", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (env.status === "zero") return { label: "measured zero", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (env.status === "empty") return { label: "no data", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (env.status === "blocked") return { label: "loading", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (env.status === "error") return { label: "error", background: "rgba(244,63,94,0.12)", color: "#f43f5e" };
  if (env.status === "unavailable") return { label: "unavailable", background: "rgba(245,158,11,0.12)", color: "#f59e0b" };
  return { label: env.status, background: "rgba(245,158,11,0.12)", color: "#f59e0b" };
}

function envelopeLabel(env: NumberEnvelope, formatter: (n: number) => string = formatNum): string {
  if (env.status === "live" || env.status === "zero") {
    if (env.value === null) return "0";
    return formatter(env.value);
  }
  if (env.status === "empty") return "no data";
  if (env.status === "blocked") return "loading";
  if (env.status === "unavailable") return "unavailable";
  if (env.status === "error") return "error";
  return env.status;
}

function tokenStatsEnvelopes(
  data: { stats?: Record<string, unknown>; timestamp?: string } | undefined,
  error: unknown,
  isLoading: boolean
): {
  tokensProcessed: NumberEnvelope;
  tokensSaved: NumberEnvelope;
  totalCommands: NumberEnvelope;
  avgExecutionTime: NumberEnvelope;
  savingsPercent: NumberEnvelope;
} {
  const source = "/api/tokens";
  const observedAt = data?.timestamp ?? null;
  const rtkUnavailable = isLoading === false && (error !== undefined && error !== null || data === undefined || data?.stats === null);

  if (error) {
    const errMsg = error instanceof Error ? error.message : "unknown error";
    const env = (status: NumberEnvelope["status"], reason: string): NumberEnvelope =>
      metricEnvelope<number>({
        value: null,
        status,
        source,
        observedAt: null,
        freshnessMs: null,
        scope: { window: "cumulative", workspace: "all" },
        reason,
      });
    return {
      tokensProcessed: env("error", `Failed to load ${source}: ${errMsg}. RTK token stats are cumulative (window=cumulative, workspace=all) until RTK exposes ranged stats.`),
      tokensSaved: env("error", `Failed to load ${source}: ${errMsg}. Savings baseline is explicitly unavailable until a retained-memory baseline exists.`),
      totalCommands: env("error", `Failed to load ${source}: ${errMsg}`),
      avgExecutionTime: env("error", `Failed to load ${source}: ${errMsg}`),
      savingsPercent: env("error", `Failed to load ${source}: ${errMsg}`),
    };
  }
  if (isLoading || !data) {
    const env = metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "cumulative", workspace: "all" },
      reason: `Loading ${source}. RTK token stats are cumulative (window=cumulative, workspace=all).`,
    });
    return {
      tokensProcessed: env,
      tokensSaved: env,
      totalCommands: env,
      avgExecutionTime: env,
      savingsPercent: env,
    };
  }

  const stats = data?.stats;
  const totalInput = typeof stats?.totalInput === "number" ? (stats.totalInput as number) : null;
  const totalOutput = typeof stats?.totalOutput === "number" ? (stats.totalOutput as number) : null;
  const tokensSaved = typeof stats?.tokensSaved === "number" ? (stats.tokensSaved as number) : null;
  const totalCommands = typeof stats?.totalCommands === "number" ? (stats.totalCommands as number) : null;
  const avgExecutionTime = typeof stats?.avgExecutionTime === "number" ? (stats.avgExecutionTime as number) : null;
  const savingsPercent = typeof stats?.savingsPercent === "number" ? (stats.savingsPercent as number) : null;

  // RTK only exposes cumulative stats; we explicitly disclose that the
  // page-level date-range selector does not change the underlying RTK
  // measurement (VAL-LEDGER-001).
  const cumulativeScope = { window: "cumulative", workspace: "all" as const };

  if (rtkUnavailable) {
    const reason = `${source} returned no stats. RTK is unavailable on this host; the page-level date-range selector does NOT change the cumulative baseline.`;
    return {
      tokensProcessed: metricEnvelope<number>({ value: null, status: "unavailable", source, observedAt: null, freshnessMs: null, scope: cumulativeScope, reason }),
      tokensSaved: metricEnvelope<number>({ value: null, status: "unavailable", source, observedAt: null, freshnessMs: null, scope: cumulativeScope, reason: `${reason} Savings baseline is explicitly unavailable until a retained-memory baseline exists.` }),
      totalCommands: metricEnvelope<number>({ value: null, status: "unavailable", source, observedAt: null, freshnessMs: null, scope: cumulativeScope, reason }),
      avgExecutionTime: metricEnvelope<number>({ value: null, status: "unavailable", source, observedAt: null, freshnessMs: null, scope: cumulativeScope, reason }),
      savingsPercent: metricEnvelope<number>({ value: null, status: "unavailable", source, observedAt: null, freshnessMs: null, scope: cumulativeScope, reason: `${reason} Savings percent cannot be measured as zero without a baseline.` }),
    };
  }

  const liveOrZero = (
    value: number | null,
    reason: string
  ): NumberEnvelope => {
    if (value === null) {
      return metricEnvelope<number>({ value: null, status: "empty", source, observedAt, freshnessMs: null, scope: cumulativeScope, reason });
    }
    if (value === 0) {
      return metricEnvelope<number>({ value: 0, status: "zero", source, observedAt, freshnessMs: null, scope: cumulativeScope, reason: `Successful ${source} measured exactly zero (cumulative, workspace=all).` });
    }
    return metricEnvelope<number>({ value, status: "live", source, observedAt, freshnessMs: null, scope: cumulativeScope, reason });
  };

  return {
    tokensProcessed: liveOrZero(
      totalInput !== null && totalOutput !== null ? totalInput + totalOutput : null,
      `${source} returned no cumulative input/output token counts`
    ),
    tokensSaved: metricEnvelope<number>({
      value: tokensSaved,
      status: tokensSaved === null
        ? "unavailable"
        : tokensSaved === 0
          ? "zero"
          : "live",
      source,
      observedAt,
      freshnessMs: null,
      scope: cumulativeScope,
      reason:
        tokensSaved === null
          ? "Savings baseline is explicitly unavailable until a retained-memory baseline exists; never report a measured zero without one."
          : tokensSaved === 0
            ? `Successful ${source} measured exactly zero cumulative savings (cumulative, workspace=all).`
            : `${formatNum(tokensSaved)} cumulative tokens saved by RTK (cumulative, workspace=all).`,
    }),
    totalCommands: liveOrZero(totalCommands, `${source} returned no cumulative command count`),
    avgExecutionTime: liveOrZero(avgExecutionTime, `${source} returned no avg execution time`),
    savingsPercent: metricEnvelope<number>({
      value: savingsPercent,
      status: savingsPercent === null
        ? "unavailable"
        : savingsPercent === 0
          ? "zero"
          : "live",
      source,
      observedAt,
      freshnessMs: null,
      scope: cumulativeScope,
      reason:
        savingsPercent === null
          ? "Savings percent is explicitly unavailable until a retained-memory baseline exists; never report a measured zero without one."
          : savingsPercent === 0
            ? `Successful ${source} measured exactly 0% savings (cumulative, workspace=all).`
            : `${savingsPercent.toFixed(1)}% savings rate from ${source} (cumulative, workspace=all).`,
    }),
  };
}

function modelMixEnvelopes(
  data: { usage?: { models?: Array<{ name: string; totalTokens: number }>; total?: unknown }; timestamp?: string } | undefined,
  error: unknown,
  isLoading: boolean,
  since: string
): {
  modelMix: NumberEnvelope;
  tableModels: Array<{ name: string; totalTokens: number }>;
} {
  const source = `/api/model-usage?since=${encodeURIComponent(since)}`;
  const observedAt = data?.timestamp ?? null;
  const scope = { window: `since=${since.slice(0, 10)}`, workspace: "all" as const };
  if (error) {
    return {
      modelMix: metricEnvelope<number>({
        value: null,
        status: "error",
        source,
        observedAt: null,
        freshnessMs: null,
        scope,
        reason: error instanceof Error ? error.message : "Failed to load /api/model-usage",
      }),
      tableModels: [],
    };
  }
  if (isLoading || !data) {
    return {
      modelMix: metricEnvelope<number>({
        value: null,
        status: "blocked",
        source,
        observedAt: null,
        freshnessMs: null,
        scope,
        reason: `Loading ${source}`,
      }),
      tableModels: [],
    };
  }
  const models = data?.usage?.models ?? [];
  if (models.length === 0) {
    return {
      modelMix: metricEnvelope<number>({
        value: null,
        status: "empty",
        source,
        observedAt,
        freshnessMs: null,
        scope,
        reason: `Healthy ${source} returned no model usage in the selected window. workspace=all (model-usage is windowed only).`,
      }),
      tableModels: [],
    };
  }
  const total = models.reduce((sum, m) => sum + (Number.isFinite(m.totalTokens) ? m.totalTokens : 0), 0);
  return {
    modelMix: metricEnvelope<number>({
      value: total,
      status: total === 0 ? "zero" : "live",
      source,
      observedAt,
      freshnessMs: null,
      scope,
      reason: total === 0
        ? `Successful ${source} measured exactly zero cumulative tokens across ${models.length} models`
        : `${formatNum(total)} cumulative tokens across ${models.length} models from ${source}`,
    }),
    tableModels: models,
  };
}

function breakdownEnvelopes(
  breakdown: Array<{ command: string; count: number; tokensSaved: number; savingsPercent: number }> | undefined
): NumberEnvelope {
  const source = "/api/tokens?section=commandBreakdown";
  const cumulativeScope = { window: "cumulative", workspace: "all" as const };
  if (!breakdown || breakdown.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: cumulativeScope,
      reason: `${source} returned no per-command breakdown`,
    });
  }
  const total = breakdown.reduce((sum, b) => sum + (Number.isFinite(b.tokensSaved) ? b.tokensSaved : 0), 0);
  return metricEnvelope<number>({
    value: total,
    status: total === 0 ? "zero" : "live",
    source,
    observedAt: null,
    freshnessMs: null,
    scope: cumulativeScope,
    reason:
      total === 0
        ? `Successful ${source} measured exactly zero savings across ${breakdown.length} commands`
        : `${formatNum(total)} tokens saved across ${breakdown.length} commands from ${source}`,
  });
}

function EnvelopeStatCard({
  label,
  tooltip,
  envelope,
  format,
  subtitle,
}: {
  label: React.ReactNode;
  tooltip?: string;
  envelope: NumberEnvelope;
  format?: (n: number) => string;
  subtitle?: React.ReactNode;
}) {
  const badge = envelopeBadge(envelope);
  return (
    <div data-ledger-kpi={typeof label === "string" ? label : undefined} data-ledger-kpi-status={envelope.status}>
      <Stat
        label={
          <>
            {label} <InfoTip text={tooltip ?? ""} />
          </>
        }
        value={envelopeLabel(envelope, format)}
        tone={envelope.status === "error" ? "warn" : "info"}
        sub={subtitle}
      />
      <div
        className="mt-1 flex items-center gap-1 text-[10px]"
        style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
        data-ledger-kpi-source
      >
        <span
          className="rounded px-1 py-0.5 font-semibold uppercase tracking-wide"
          style={{ background: badge.background, color: badge.color }}
          data-ledger-kpi-badge={envelope.status}
        >
          {badge.label}
        </span>
        <span>{envelope.source}</span>
      </div>
      {envelope.reason && envelope.status !== "live" && envelope.status !== "zero" && (
        <p
          className="mt-1 text-[10px] leading-4"
          style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
          data-ledger-kpi-reason
        >
          {envelope.reason}
        </p>
      )}
    </div>
  );
}

const TABS = ["Savings Breakdown", "Model Mix"] as const;
type Tab = (typeof TABS)[number];
const LEDGER_RANGES = [
  { label: "Last 24 hours", value: "1", days: 1 },
  { label: "Last 7 days", value: "7", days: 7 },
  { label: "Last 30 days", value: "30", days: 30 },
] as const;


export default function LedgerPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  const [rangeDays, setRangeDays] = useState<(typeof LEDGER_RANGES)[number]["value"]>("7");
  const [rangeAnchorIso] = useState(() => new Date().toISOString());
  const selectedRange = LEDGER_RANGES.find((range) => range.value === rangeDays) ?? LEDGER_RANGES[1];
  const since = new Date(new Date(rangeAnchorIso).getTime() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, isLoading: tokenLoading, error: tokenError } = useTokenStats();
  const { data: modelData, isLoading: modelLoading, error: modelError } = useModelUsage(since);
  const [activeTab, setActiveTab] = useState<Tab>("Savings Breakdown");

  const stats = data?.stats ?? {};
  const totalInput = (stats.totalInput as number) ?? 0;
  const totalOutput = (stats.totalOutput as number) ?? 0;
  const tokensSavedRaw = (stats.tokensSaved as number) ?? 0;
  const savingsPercentRaw = (stats.savingsPercent as number) ?? 0;

  const tokenEnvelopes = tokenStatsEnvelopes(data, tokenError, tokenLoading);
  const mixEnvelopes = modelMixEnvelopes(modelData, modelError, modelLoading, since);

  const breakdown = (stats?.commandBreakdown as Array<{
    command: string;
    count: number;
    tokensSaved: number;
    savingsPercent: number;
  }> | undefined) || [];

  const breakdownEnv = breakdownEnvelopes(breakdown);

  const savingsData = breakdown.slice(0, 8).map((b) => ({
    command: b.command.replace("rtk ", "").slice(0, 20),
    tokensUsed: b.savingsPercent > 0
      ? Math.max(0, Math.round((b.tokensSaved / (b.savingsPercent / 100)) - b.tokensSaved))
      : 0,
    tokensSaved: b.tokensSaved,
  }));

  const modelMixData = mixEnvelopes.tableModels.map((m) => ({
    name: m.name,
    value: m.totalTokens,
  }));

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6">

      <PageHeader
        eyebrow="Operations"
        title="Ledger"
        hint="Token savings, model mix, routing quality, and cost analytics across retained work."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="ledger">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Ledger has its own date-range selector; the originating scope is shown for reference and is NOT applied to the data below."}
          </div>
        </Card>
      )}
      <Card className="flex flex-wrap items-center gap-3" pad="sm" data-ledger-filter-card>
        <label className="text-sm font-semibold" style={{ color: NOC.ink }} htmlFor="ledger-date-range">
          Date range
        </label>
        <select
          id="ledger-date-range"
          className="px-2 py-1.5 text-sm focus:outline-none"
          style={{ background: NOC.paper, border: `1px solid ${NOC.ruleStrong}`, color: NOC.ink }}
          value={rangeDays}
          onChange={(event) => setRangeDays(event.target.value as typeof rangeDays)}
          data-ledger-filter-select
        >
          {LEDGER_RANGES.map((range) => (
            <option key={range.value} value={range.value} data-ledger-filter-option={range.value}>
              {range.label}
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: NOC.soft }} data-ledger-filter-scope>
          Model mix window={rangeDays}d (since={since.slice(0, 10)}, workspace=all). RTK token savings are cumulative until RTK exposes ranged stats.
        </span>
      </Card>

      {(tokenLoading || modelLoading || tokenError || modelError) && (
        <Card pad="sm" data-ledger-source-status>
          <div className="text-sm font-semibold" style={{ color: NOC.ink }}>Ledger source status</div>
          <div className="mt-1 text-xs" style={{ color: tokenError || modelError ? NOC.terra : NOC.soft }}>
            {tokenLoading || modelLoading ? "Loading RTK token stats and Claude model usage..." : null}
            {tokenError ? `RTK token stats failed: ${tokenError instanceof Error ? tokenError.message : "unknown error"}. ` : null}
            {modelError ? `Model usage failed: ${modelError instanceof Error ? modelError.message : "unknown error"}.` : null}
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <EnvelopeStatCard
            label={<>Tokens Processed <InfoTip text="Total tokens sent to and received from AI models — input (prompts) plus output (responses). Sourced from RTK's SQLite session log. RTK exposes cumulative stats only; the page-level date-range selector does NOT change the underlying measurement (window=cumulative, workspace=all)." /></>}
            envelope={tokenEnvelopes.tokensProcessed}
            subtitle={
              <span style={{ fontFamily: NOC_FONT_MONO }}>
                {formatNum(totalInput)} in / {formatNum(totalOutput)} out
              </span>
            }
          />
        </Card>
        <Card>
          <EnvelopeStatCard
            label={<>Tokens Saved <InfoTip text="Tokens that would have been sent without RTK's output filtering. Cumulative until a retained-memory baseline exists; never reported as a measured zero without one (VAL-LEDGER-001)." /></>}
            envelope={tokenEnvelopes.tokensSaved}
            subtitle={
              savingsPercentRaw > 0 ? (
                <span style={{ fontFamily: NOC_FONT_MONO }}>{savingsPercentRaw.toFixed(1)}% savings rate</span>
              ) : tokenEnvelopes.savingsPercent.status === "unavailable" ? undefined : undefined
            }
          />
        </Card>
        <Card>
          <EnvelopeStatCard
            label={<>Total Commands <InfoTip text="Number of CLI commands executed through the RTK proxy. Cumulative (window=cumulative, workspace=all)." /></>}
            envelope={tokenEnvelopes.totalCommands}
          />
        </Card>
        <Card>
          <EnvelopeStatCard
            label={<>Avg Execution <InfoTip text="Average wall-clock time per RTK-proxied command, in seconds. Cumulative (window=cumulative, workspace=all)." /></>}
            envelope={tokenEnvelopes.avgExecutionTime}
            format={(n) => `${n.toFixed(1)}s`}
          />
        </Card>
      </div>

      {/* Chart Tabs */}
      <Card data-ledger-tab-card>
        {/* Tab List */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex gap-1 w-fit p-1" style={{ background: NOC.fog, border: `1px solid ${NOC.rule}` }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "px-4 py-1.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "border"
                      : "",
                  ].join(" ")}
                  style={{
                    background: isActive ? NOC.peach : "transparent",
                    borderColor: isActive ? NOC.terra : "transparent",
                    color: isActive ? NOC.terraDeep : NOC.muted,
                  }}
                  data-ledger-tab={tab}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          {activeTab === "Savings Breakdown" && (
            <InfoTip text="Per-command breakdown of token savings. Cumulative until a retained-memory baseline exists." />
          )}
          {activeTab === "Model Mix" && (
            <InfoTip text={`Distribution of token usage across Claude model tiers. Windowed from /api/model-usage?since=${since.slice(0, 10)}.`} />
          )}
        </div>

        {/* Tab Content */}
        {activeTab === "Savings Breakdown" && (
          <SavingsChart data={savingsData} envelope={breakdownEnv} />
        )}
        {activeTab === "Model Mix" && (
          <>
            <ModelMixChart data={modelMixData} envelope={mixEnvelopes.modelMix} />
            <p className="mt-3 text-xs" style={{ color: NOC.soft }}>
              Aggregated from Claude Code session logs (~/.claude/projects) for window={rangeDays}d (since={since.slice(0, 10)}).
            </p>
          </>
        )}
      </Card>

      {/* Cost Calculator */}
      <CostCalculator
        totalInput={totalInput}
        totalOutput={totalOutput}
        tokensSaved={tokensSavedRaw}
        savingsEnvelope={tokenEnvelopes.tokensSaved}
      />

      <ModelRoutingPanel />

      {/* Usage Trends */}
      <LedgerAnalyticsPanel />

    </div>
    </TooltipProvider>
  );
}
