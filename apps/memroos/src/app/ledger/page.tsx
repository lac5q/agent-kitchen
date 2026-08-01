"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useModelUsage } from "@/lib/api-client";
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

type ModelUsagePayload = {
  usage?: {
    total: { inputTokens: number; outputTokens: number; cacheRead: number; requests: number };
    models: Array<{ name: string; totalTokens: number }>;
  };
  sources?: {
    claudeJsonlModels?: number;
    efficiencyLedgerModels?: number;
    modelRoutingModels?: number;
    modelRoutingUsedAsFallback?: number;
  };
  timestamp?: string;
};

function tokensProcessedEnvelope(
  modelData: ModelUsagePayload | undefined,
  modelError: unknown,
  modelLoading: boolean,
  since: string
): { envelope: NumberEnvelope; inputTokens: number; outputTokens: number; requests: number } {
  const source = "/api/model-usage";
  const scope = { window: `since=${since.slice(0, 10)}`, workspace: "all" as const };
  const sourceDiag = modelData?.sources
    ? ` sources={claudeJsonl:${modelData.sources.claudeJsonlModels ?? 0}, token_ledger:${modelData.sources.efficiencyLedgerModels ?? 0}, model_routing:${modelData.sources.modelRoutingModels ?? 0}}`
    : "";
  if (modelError) {
    const errMsg = modelError instanceof Error ? modelError.message : "unknown error";
    return {
      envelope: metricEnvelope<number>({
        value: null,
        status: "error",
        source,
        observedAt: null,
        freshnessMs: null,
        scope,
        reason: `Failed to load multi-model usage (${errMsg}).`,
      }),
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    };
  }
  if (modelLoading || !modelData) {
    return {
      envelope: metricEnvelope<number>({
        value: null,
        status: "blocked",
        source,
        observedAt: null,
        freshnessMs: null,
        scope,
        reason: `Loading multi-model token totals since ${since.slice(0, 10)}.`,
      }),
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    };
  }
  const total = modelData.usage?.total;
  const inputTokens = total?.inputTokens ?? 0;
  const outputTokens = total?.outputTokens ?? 0;
  const cacheRead = total?.cacheRead ?? 0;
  const requests = total?.requests ?? 0;
  const processed = inputTokens + outputTokens + cacheRead;
  const models = modelData.usage?.models?.length ?? 0;
  if (models === 0 && processed === 0) {
    return {
      envelope: metricEnvelope<number>({
        value: null,
        status: "empty",
        source,
        observedAt: modelData.timestamp ?? null,
        freshnessMs: null,
        scope,
        reason: `No model token observations since ${since.slice(0, 10)} (Claude JSONL + efficiency token_ledger + model_routing_events). Writers have not posted usage yet — not a fabricated zero.${sourceDiag}`,
      }),
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    };
  }
  return {
    envelope: metricEnvelope<number>({
      value: processed,
      status: processed === 0 ? "zero" : "live",
      source,
      observedAt: modelData.timestamp ?? null,
      freshnessMs: null,
      scope,
      reason: `${formatNum(processed)} tokens across ${models} model(s) since ${since.slice(0, 10)} (input+output+cacheRead).${sourceDiag}`,
    }),
    inputTokens,
    outputTokens,
    requests,
  };
}

function requestsEnvelope(
  processed: ReturnType<typeof tokensProcessedEnvelope>,
  since: string
): NumberEnvelope {
  const source = "/api/model-usage";
  const scope = { window: `since=${since.slice(0, 10)}`, workspace: "all" as const };
  if (processed.envelope.status === "error" || processed.envelope.status === "blocked") {
    return { ...processed.envelope, value: null };
  }
  if (processed.envelope.status === "empty") {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: processed.envelope.observedAt,
      freshnessMs: null,
      scope,
      reason: `No recorded model requests since ${since.slice(0, 10)}.`,
    });
  }
  return metricEnvelope<number>({
    value: processed.requests,
    status: processed.requests === 0 ? "zero" : "live",
    source,
    observedAt: processed.envelope.observedAt,
    freshnessMs: null,
    scope,
    reason: `${formatNum(processed.requests)} recorded model requests since ${since.slice(0, 10)}.`,
  });
}

function modelsObservedEnvelope(
  modelData: ModelUsagePayload | undefined,
  modelError: unknown,
  modelLoading: boolean,
  since: string
): NumberEnvelope {
  const source = "/api/model-usage";
  const scope = { window: `since=${since.slice(0, 10)}`, workspace: "all" as const };
  if (modelError) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope,
      reason: modelError instanceof Error ? modelError.message : "Failed to load model usage",
    });
  }
  if (modelLoading || !modelData) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope,
      reason: `Loading ${source}`,
    });
  }
  const count = modelData.usage?.models?.length ?? 0;
  if (count === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: modelData.timestamp ?? null,
      freshnessMs: null,
      scope,
      reason: `No models observed since ${since.slice(0, 10)}.`,
    });
  }
  return metricEnvelope<number>({
    value: count,
    status: "live",
    source,
    observedAt: modelData.timestamp ?? null,
    freshnessMs: null,
    scope,
    reason: `${count} model(s) with token observations since ${since.slice(0, 10)}.`,
  });
}

function modelMixEnvelopes(
  data: ModelUsagePayload | undefined,
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
  const { data: modelData, isLoading: modelLoading, error: modelError } = useModelUsage(since);

  const processed = tokensProcessedEnvelope(modelData, modelError, modelLoading, since);
  const requestEnv = requestsEnvelope(processed, since);
  const modelsEnv = modelsObservedEnvelope(modelData, modelError, modelLoading, since);
  const mixEnvelopes = modelMixEnvelopes(modelData, modelError, modelLoading, since);

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
        hint="Model token usage, routing quality, and cost analytics from durable MemRoOS observations — not an external CLI proxy."
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
          Tokens / Model Mix window={rangeDays}d (since={since.slice(0, 10)}, workspace=all) from /api/model-usage.
        </span>
      </Card>

      {(modelLoading || modelError || processed.envelope.status === "empty") && (
        <Card pad="sm" data-ledger-source-status>
          <div className="text-sm font-semibold" style={{ color: NOC.ink }}>Ledger source status</div>
          <div className="mt-1 text-xs" style={{ color: modelError ? NOC.terra : NOC.soft }}>
            {modelLoading ? "Loading multi-model usage..." : null}
            {!modelLoading && modelData?.sources
              ? `model-usage sources: claudeJsonl=${modelData.sources.claudeJsonlModels ?? 0}, token_ledger=${modelData.sources.efficiencyLedgerModels ?? 0}, model_routing=${modelData.sources.modelRoutingModels ?? 0}. `
              : null}
            {modelError ? `Model usage failed: ${modelError instanceof Error ? modelError.message : "unknown error"}.` : null}
            {!modelLoading && !modelError && processed.envelope.status === "empty"
              ? "Token writers are idle: post to /api/model-routing/telemetry (or GSD routeGsdModel) / operations telemetry tokenLedgers, or mount Claude JSONL sessions."
              : null}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <EnvelopeStatCard
            label={<>Tokens Processed <InfoTip text="Total tokens across observed models — input + output + cacheRead from /api/model-usage (Claude JSONL + efficiency token_ledger; model_routing_events only when ledger is empty)." /></>}
            envelope={processed.envelope}
            subtitle={
              <span style={{ fontFamily: NOC_FONT_MONO }}>
                {formatNum(processed.inputTokens)} in / {formatNum(processed.outputTokens)} out
              </span>
            }
          />
        </Card>
        <Card>
          <EnvelopeStatCard
            label={<>Requests <InfoTip text="Count of recorded model usage observations in the selected window (from /api/model-usage)." /></>}
            envelope={requestEnv}
          />
        </Card>
        <Card>
          <EnvelopeStatCard
            label={<>Models Observed <InfoTip text="Distinct models with token observations in the selected window." /></>}
            envelope={modelsEnv}
          />
        </Card>
      </div>

      <Card data-ledger-tab-card>
        <div className="mb-5 flex items-center gap-3">
          <div className="text-sm font-semibold" style={{ color: NOC.ink }}>Model Mix</div>
          <InfoTip text={`Distribution of token usage across models. Windowed from /api/model-usage?since=${since.slice(0, 10)}.`} />
        </div>
        <ModelMixChart data={modelMixData} envelope={mixEnvelopes.modelMix} />
        <p className="mt-3 text-xs" style={{ color: NOC.soft }}>
          Aggregated from Claude JSONL + efficiency token_ledger + model_routing_events for window={rangeDays}d (since={since.slice(0, 10)}).
        </p>
      </Card>

      <CostCalculator
        totalInput={processed.inputTokens}
        totalOutput={processed.outputTokens}
      />

      <ModelRoutingPanel />

      <LedgerAnalyticsPanel />

    </div>
    </TooltipProvider>
  );
}
