
"use client";

import { useState } from "react";
import { Spark } from "@/components/shared/charts";
import { useDelegations, useHiveFeed, useModelRoutingDashboard, useModelUsage, useSkills } from "@/lib/api-client";
import type { MetricStatus } from "@/lib/metric-status";
import { LOCAL_NOC_AGENT_IDS, nocWindowLabel, nocWindowToSinceIso, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

const LOCAL_AGENT_IDS = new Set<string>(LOCAL_NOC_AGENT_IDS);

function costWorkspaceMatches(
  agentId: string | null,
  workspace: NocFilters["workspace"],
): boolean {
  if (workspace === "all") return true;
  if (!agentId) return false;
  const isLocal = LOCAL_AGENT_IDS.has(agentId);
  return workspace === "local" ? isLocal : !isLocal;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

/** Spend-first cost panel. Savings and waste stay hidden until the ledger proves them. */
export function Cost({ filters }: { filters: NocFilters }) {
  const since = nocWindowToSinceIso(filters.window);
  const routing = useModelRoutingDashboard(500);
  const allEvents = routing.data?.events ?? [];
  const workspaceHistory = allEvents.filter((event) =>
    costWorkspaceMatches(event.agentId, filters.workspace),
  );
  const events = workspaceHistory.filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return Number.isFinite(createdAt) && createdAt >= Date.parse(since);
  });
  const costedEvents = events.filter(
    (event): event is typeof event & { estimatedCostUsd: number } =>
      typeof event.estimatedCostUsd === "number" &&
      Number.isFinite(event.estimatedCostUsd),
  );
  const missingCostEvents = events.filter(
    (event) =>
      typeof event.estimatedCostUsd !== "number" ||
      !Number.isFinite(event.estimatedCostUsd),
  );
  const costedHistory = workspaceHistory.filter(
    (event) =>
      typeof event.estimatedCostUsd === "number" &&
      Number.isFinite(event.estimatedCostUsd),
  );
  const spend = costedEvents.reduce(
    (total, event) => total + event.estimatedCostUsd,
    0,
  );
  const modelAggregates = new Map<
    string,
    { requests: number; totalTokens: number; spend: number | null; missingCost: boolean }
  >();
  for (const event of events) {
    const current = modelAggregates.get(event.model) ?? {
      requests: 0,
      totalTokens: 0,
      spend: null,
      missingCost: false,
    };
    current.requests += 1;
    current.totalTokens += event.inputTokens + event.outputTokens;
    if (
      typeof event.estimatedCostUsd === "number" &&
      Number.isFinite(event.estimatedCostUsd)
    ) {
      current.spend = (current.spend ?? 0) + event.estimatedCostUsd;
    } else {
      current.missingCost = true;
    }
    modelAggregates.set(event.model, current);
  }
  const modelRows = Array.from(modelAggregates, ([name, aggregate]) => ({
    name,
    requests: aggregate.requests,
    totalTokens: aggregate.totalTokens,
    spend: aggregate.missingCost ? null : aggregate.spend,
  }))
    .sort(
      (a, b) =>
        (b.spend ?? -1) - (a.spend ?? -1) ||
        b.totalTokens - a.totalTokens ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 8);

  // Phase 174 four-state: live / window_empty / no_history / stale_or_error.
  // An in-window ledger row with a missing `estimatedCostUsd` is NOT
  // window_empty — it is a measurement-gap, surfaced as "stale_or_error" so
  // the operator is not told to widen the window when the real problem is
  // missing cost data. window_empty is reserved for "rows exist in a wider
  // window, but none in the selected window".
  const panelSemantic: "live" | "window_empty" | "no_history" | "stale_or_error" | "loading" =
    routing.isError
      ? "stale_or_error"
      : routing.isLoading
        ? "loading"
        : events.length > 0
          ? missingCostEvents.length > 0
            ? "stale_or_error"
            : "live"
          : costedHistory.length > 0
            ? "window_empty"
            : workspaceHistory.length > 0
              ? "stale_or_error"
              : "no_history";
  const status: MetricStatus =
    panelSemantic === "live"
      ? "live"
      : panelSemantic === "window_empty"
        ? "empty"
        : panelSemantic === "stale_or_error"
          ? "error"
          : "blocked";

  const stateCopy = routing.isError
    ? "Spend data is stale or unavailable; the model-routing ledger may be down."
    : routing.isLoading
      ? "Loading model spend…"
      : events.length > 0 && missingCostEvents.length > 0
        ? `Spend data missing for ${nocWindowLabel(filters.window)}: ${missingCostEvents.length} of ${events.length} in-scope ledger row${events.length === 1 ? "" : "s"} ${missingCostEvents.length === 1 ? "does" : "do"} not carry an estimatedCostUsd. The partial total is withheld until every selected row is costed.`
        : events.length === 0 && workspaceHistory.length > 0 && costedHistory.length === 0
          ? `Spend data missing for workspace=${filters.workspace}: ledger history exists, but none of its rows carry an estimatedCostUsd. Backfill cost in the routing ledger.`
          : costedHistory.length > 0
            ? `Nothing in ${nocWindowLabel(filters.window)} for workspace=${filters.workspace}; ${costedHistory.length} costed ledger row${costedHistory.length === 1 ? " exists" : "s exist"} outside this window. Widen the window?`
            : `No spend history yet for workspace=${filters.workspace}. Model-routing ledger rows with estimated cost populate this panel. Try: run an agent task.`;

  return (
    <NocCard style={{ width: "100%" }}>
      <NocPanelHeader
        title={`Cost · ${nocWindowLabel(filters.window)}`}
        hint={`Spend, requests, and token usage come from model-routing ledger rows and are filtered together by window=${filters.window}, workspace=${filters.workspace}. Spend remains withheld when any selected row lacks estimatedCostUsd.`}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SourceStatusBadge status={status} />
            <SourceStatusBadge
              status={panelSemantic === "live" ? "live" : panelSemantic === "window_empty" ? "empty" : panelSemantic === "stale_or_error" ? "error" : "empty"}
              label={panelSemantic}
            />
            <span
              data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
              style={{ fontSize: 10, color: NOC.soft, fontFamily: NOC_FONT_MONO }}
            >
              window={filters.window}/workspace={filters.workspace}
            </span>
          </div>
        }
      />
      <div
        style={{
          alignItems: "baseline",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Eyebrow>Measured spend</Eyebrow>
        <Mono size={28} color={status === "live" ? NOC.ink : NOC.soft}>
          {status === "live" ? formatUsd(spend) : "—"}
        </Mono>
        {status === "live" ? (
          <span style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 11 }}>
            {costedEvents.length}/{events.length} ledger rows costed
          </span>
        ) : null}
      </div>

      {status !== "live" ? (
        <div
          data-status-block={panelSemantic}
          style={{
            background: status === "error" ? NOC.warnBg : NOC.fog,
            border: `1px solid ${status === "error" ? NOC.warn : NOC.rule}`,
            color: status === "error" ? NOC.warn : NOC.soft,
            fontSize: 11.5,
            lineHeight: 1.5,
            marginTop: 12,
            padding: "10px 12px",
          }}
        >
          {stateCopy}
        </div>
      ) : null}

      <div
        data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
        style={{
          borderTop: `1px solid ${NOC.rule}`,
          marginTop: 14,
          paddingTop: 10,
        }}
      >
        <Eyebrow>Per-model usage</Eyebrow>
        {routing.isError ? (
          <div data-status-block="stale_or_error" style={{ color: NOC.warn, fontSize: 11.5, marginTop: 8 }}>
            Per-model usage is stale or unavailable; the model-routing ledger may be down.
          </div>
        ) : routing.isLoading ? (
          <div data-status-block="no_history" style={{ color: NOC.soft, fontSize: 11.5, marginTop: 8 }}>
            Loading per-model usage…
          </div>
        ) : modelRows.length === 0 ? (
          <div data-status-block="no_history" style={{ color: NOC.soft, fontSize: 11.5, marginTop: 8 }}>
            No per-model usage history in {nocWindowLabel(filters.window)} for workspace={filters.workspace}. The first model request populates this list.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 7,
              marginTop: 8,
            }}
          >
            {modelRows.map((row) => (
              <div
                key={row.name}
                data-cost-model={row.name}
                data-mobile-grid="cost-model-row"
                style={{
                  alignItems: "center",
                  borderTop: `1px solid ${NOC.rule}`,
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))",
                  paddingTop: 7,
                }}
              >
                <span style={{ color: NOC.ink, fontFamily: NOC_FONT_MONO, fontSize: 11 }}>{row.name}</span>
                <Mono size={11}>{`${row.requests} req`}</Mono>
                <Mono size={11}>{`${new Intl.NumberFormat("en", { notation: "compact" }).format(row.totalTokens)} tok`}</Mono>
                <Mono size={11} color={row.spend === null ? NOC.soft : NOC.ink}>
                  {row.spend === null ? "— spend" : formatUsd(row.spend)}
                </Mono>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 10, marginTop: 10 }}>
        source: sqlite://model_routing_events · filters: {filters.window}/{filters.workspace}
      </div>
    </NocCard>
  );
}

export function Savings({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const [since24h] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const modelUsage = useModelUsage(since24h);
  // Finding (5): never coerce absent model-usage data into 0. Compute a
  // truthful envelope and only surface numeric totals when the source
  // is live. When model-usage is failed/loading/unavailable the sparkline
  // receives [] and the requests/tokens summary is hidden entirely.
  const modelUsageLive =
    !modelUsage.isError &&
    !modelUsage.isLoading &&
    modelUsage.data !== undefined;
  const modelUsageEmpty = modelUsageLive
    ? modelUsage.data!.usage.models.length === 0
    : false;
  const requests = modelUsageLive ? modelUsage.data!.usage.total.requests : null;
  const tokenTotal = modelUsageLive
    ? modelUsage.data!.usage.total.inputTokens +
      modelUsage.data!.usage.total.outputTokens +
      modelUsage.data!.usage.total.cacheRead
    : null;
  const spark: number[] = modelUsageLive
    ? modelUsage.data!.usage.models.slice(0, 12).map((model) => model.totalTokens)
    : [];

  return (
    <NocCard>

      <NocPanelHeader
        title="Savings source"
        hint={`Baseline savings are explicitly withheld until retained-memory baseline telemetry exists. Token sparkline reflects the last ${nocWindowLabel(effectiveFilters.window)} from /api/model-usage (window=${effectiveFilters.window}, workspace=${effectiveFilters.workspace} not applied to model telemetry).`}
        right={<SourceStatusBadge status="blocked" label="baseline blocked" />}
      />      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }} data-status-block="savings-blocked">
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 99,
            background: NOC.fog,
            color: NOC.warn,
            border: `1px dashed ${NOC.warn}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontFamily: NOC_FONT_MONO,
            textAlign: "center",
            lineHeight: 1.2,
            padding: 8,
          }}
        >
          baseline
          <br />
          unavailable
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: NOC.muted,
            lineHeight: 1.5,
            flex: 1,
            minWidth: 0,
            fontFamily: NOC_FONT_MONO,
            overflowWrap: "anywhere",
          }}
        >
          {modelUsage.isError
            ? "Failed to load /api/model-usage — savings computation pending"
            : "No dollar-savings claim is rendered without a live baseline source. Token totals are still surfaced from /api/model-usage."}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {spark.length >= 2 ? (
          <Spark
            values={spark}
            color={NOC.success}
            w={280}
            h={40}
            fill
          />
        ) : (
          <div
            style={{
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: NOC.muted,
              fontFamily: NOC_FONT_MONO,
              fontSize: 11,
              border: `1px dashed ${NOC.rule}`,
              padding: "0 8px",
              textAlign: "center",
            }}
            data-status-block="savings-sparkline-withheld"
          >
            {modelUsage.isError
              ? "Token sparkline withheld — failed to load /api/model-usage"
              : modelUsage.isLoading
                ? "Token sparkline withheld — loading /api/model-usage"
                : modelUsageEmpty
                  ? "Token sparkline withheld — /api/model-usage returned no models"
                  : "Token sparkline withheld — no /api/model-usage data"}
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: NOC.soft,
          fontFamily: NOC_FONT_MONO,
        }}
      >
        <span>12d ago</span>
        <span style={{ color: requests !== null ? NOC.success : NOC.muted }}>
          {requests !== null && tokenTotal !== null
            ? `${requests} requests · ${new Intl.NumberFormat("en", { notation: "compact" }).format(tokenTotal)} tokens`
            : "requests/tokens withheld — /api/model-usage not live"}
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: "8px 10px",
          background: NOC.warnBg,
          border: `1px solid ${NOC.warnBg}`,
          color: NOC.warn,
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: NOC_FONT_MONO,
          letterSpacing: "0.08em",
        }}
      >
        EXPLICIT NON-LIVE STATE — savings is blocked until baseline retention is healthy
      </div>
    </NocCard>
  );
}



export function Waste({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const hive = useHiveFeed(200);
  const delegations = useDelegations(200);
  const skills = useSkills();  // Per-source measurement booleans so we never coerce an absent source
  // into a numeric zero. Each row is rendered independently against its
  // own source state.
  const hiveOk = !hive.isError && !hive.isLoading && hive.data !== undefined;
  const delegationsOk = !delegations.isError && !delegations.isLoading && delegations.data !== undefined;
  const skillsOk = !skills.isError && !skills.isLoading && skills.data !== undefined;
  const retries = hiveOk ? hive.data!.actions.filter((a) => a.action_type === "error").length : null;
  const blocks = delegationsOk
    ? delegations.data!.delegations.filter((d) => d.status === "failed" || d.status === "canceled").length
    : null;
  const duplicateSkills = skillsOk ? skills.data!.skillBudget.duplicateSkills.length : null;
  const coldReads = skillsOk ? skills.data!.coverageGaps.length : null;

  type LocalStatus = "live" | "empty" | "degraded" | "error";
  const sourceFailed = hive.isError || delegations.isError || skills.isError;
  const panelStatus: LocalStatus = sourceFailed
    ? "error"
    : hive.isLoading || delegations.isLoading || skills.isLoading
      ? "degraded"
      : (retries ?? 0) + (blocks ?? 0) + (duplicateSkills ?? 0) + (coldReads ?? 0) === 0
        ? "empty"
        : "live";

  const rows = [
    {
      label: "Retries",
      sub: "hive errors",
      value: retries,
      ok: hiveOk,
      loading: hive.isLoading,
      errored: hive.isError,
      errorMsg: hive.error instanceof Error ? hive.error.message : "Failed to load /api/hive",
      source: "/api/hive",
    },
    {
      label: "Blocks",
      sub: "failed dispatches",
      value: blocks,
      ok: delegationsOk,
      loading: delegations.isLoading,
      errored: delegations.isError,
      errorMsg: delegations.error instanceof Error ? delegations.error.message : "Failed to load /api/delegations",
      source: "/api/delegations",
    },
    {
      label: "Duplicate skills",
      sub: "skill budget",
      value: duplicateSkills,
      ok: skillsOk,
      loading: skills.isLoading,
      errored: skills.isError,
      errorMsg: skills.error instanceof Error ? skills.error.message : "Failed to load /api/skills",
      source: "/api/skills (skill budget)",
    },
    {
      label: "Coverage gaps",
      sub: "skill telemetry",
      value: coldReads,
      ok: skillsOk,
      loading: skills.isLoading,
      errored: skills.isError,
      errorMsg: skills.error instanceof Error ? skills.error.message : "Failed to load /api/skills",
      source: "/api/skills (coverage gaps)",
    },
  ];

  function colorFor(value: number | null, errored: boolean, loading: boolean) {
    if (errored) return NOC.terra;
    if (loading) return NOC.soft;
    if (value === null) return NOC.soft;
    return value > 0 ? NOC.terra : NOC.success;
  }

  function rowState(value: number | null, errored: boolean, loading: boolean): "live" | "blocked" | "error" | "loading" {
    if (errored) return "error";
    if (loading) return "loading";
    if (value === null) return "blocked";
    return "live";
  }

  return (
    <NocCard>

      <NocPanelHeader
        title="Waste"
        hint={`Retries, blocks, duplicate skills, cold-tier reads — cumulative snapshot across all workspaces. window=${effectiveFilters.window} and workspace=${effectiveFilters.workspace} filters do not partition these metrics (${nocWindowLabel(effectiveFilters.window)} for context only). Each row renders independently against its own source; failed sources render as non-live instead of a successful zero.`}
        right={<SourceStatusBadge status={panelStatus} />}
      />      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {rows.map(({ label, sub, value, loading, errored, errorMsg, source }) => {
          const state = rowState(value, errored, loading);
          return (
            <div key={label} data-waste-row={label} data-waste-state={state}>
              <Eyebrow>{label}</Eyebrow>
              <Mono size={20} color={colorFor(value, errored, loading)}>
                {state === "live" && value !== null ? String(value) : "—"}
              </Mono>
              <div style={{ fontSize: 11, color: NOC.soft }}>
                {state === "live"
                  ? `${value === 0 ? "measured zero" : "measured"} · ${sub}`
                  : state === "error"
                    ? `source failed · ${source} (${errorMsg})`
                    : state === "loading"
                      ? `loading · ${source}`
                      : `no measurement · ${source}`}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: sourceFailed ? NOC.peach : NOC.warnBg,
          border: `1px solid ${sourceFailed ? NOC.peach : NOC.warnBg}`,
          color: sourceFailed ? NOC.terra : NOC.warn,
          fontFamily: NOC_FONT_MONO,
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 600 }}>
          {sourceFailed ? "Source error" : "Source state"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: sourceFailed ? NOC.terra : NOC.ink,
            marginTop: 3,
          }}
        >
          {sourceFailed
            ? [
                hive.isError ? "Failed to load /api/hive." : null,
                delegations.isError ? "Failed to load /api/delegations." : null,
                skills.isError ? "Failed to load /api/skills." : null,
              ]
                .filter(Boolean)
                .join(" ")
            : "Waste metrics are live counts from hive, delegations, and skill budget telemetry. Rows rendered as “—” indicate the corresponding source is not currently providing a measurement."}
        </div>
      </div>
    </NocCard>
  );
}