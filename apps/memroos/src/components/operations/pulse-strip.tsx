"use client";

import { useMemo } from "react";
import { useModelUsage, useOperationsNoc, useTimeSeries } from "@/lib/api-client";
import type { MetricEnvelope, MetricStatus } from "@/lib/metric-status";
import {
  nocWindowLabel,
  nocWindowToSinceIso,
  nocWindowToTimeSeriesWindow,
  type NocFilters,
} from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  SourceStatusBadge,
  formatObservedAt,
} from "./noc-primitives";

interface PulseStripProps {
  filters: NocFilters;
}

interface PulseCard {
  label: string;
  value: string;
  semantic: PulseSemantic;
  status: MetricStatus;
  source: string;
  detail: string;
  observedAt: string | null;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function valueFromEnvelope(envelope: MetricEnvelope<number> | undefined): string {
  if (
    envelope &&
    (envelope.status === "live" || envelope.status === "zero") &&
    envelope.value !== null
  ) {
    return compactNumber(envelope.value);
  }
  return "—";
}

/**
 * Phase 174 four-state semantic for default pulse cards. The card-level
 * `data-status-block` must be one of `live | window_empty | no_history |
 * stale_or_error` — never the raw `MetricStatus` values like `empty`,
 * `zero`, `blocked`, `degraded`, or `unavailable`, which were never
 * meant to be user-facing.
 *
 * Resolution order (most authoritative wins):
 *   1. Any error / loading / unavailable signal → `stale_or_error`
 *   2. Phase 173 `agentSourceState` (`live` | `window_empty` | `no_history`)
 *   3. Envelope state (`live` / `zero` → `live`; `empty` / `blocked` / `unavailable` → `no_history`)
 */
type PulseSemantic = "live" | "window_empty" | "no_history" | "stale_or_error" | "loading";

function envelopeSemantic(
  envelope: MetricEnvelope<number> | undefined,
  isLoading: boolean,
  isError: boolean,
  emptyIsLive = false,
): PulseSemantic {
  if (isError) return "stale_or_error";
  if (isLoading) return "loading";
  if (!envelope) return "no_history";
  if (
    envelope.status === "error" ||
    envelope.status === "stale" ||
    envelope.status === "degraded" ||
    envelope.status === "blocked" ||
    envelope.status === "unavailable"
  ) {
    return "stale_or_error";
  }
  if (envelope.status === "live" || envelope.status === "zero") return "live";
  if (envelope.status === "empty") return emptyIsLive ? "live" : "no_history";
  return "no_history";
}

function sourceStateSemantic(
  sourceState: string | undefined,
  isLoading: boolean,
  isError: boolean,
): PulseSemantic {
  if (isError || sourceState === "stale_or_error") return "stale_or_error";
  if (isLoading) return "loading";
  if (sourceState === "live") return "live";
  if (sourceState === "window_empty") return "window_empty";
  return "no_history";
}

function measuredListSemantic(
  count: number,
  isLoading: boolean,
  isError: boolean,
): PulseSemantic {
  if (isError) return "stale_or_error";
  if (isLoading) return "loading";
  return count > 0 ? "live" : "no_history";
}

function semanticToMetricStatus(semantic: PulseSemantic): MetricStatus {
  if (semantic === "live") return "live";
  if (semantic === "window_empty") return "empty";
  if (semantic === "stale_or_error") return "error";
  if (semantic === "loading") return "blocked";
  return "unavailable";
}

function sourceStateCopy(
  sourceState: string | undefined,
  windowLabel: string,
): string {
  if (sourceState === "window_empty") {
    return `Nothing in ${windowLabel}; message history exists outside this window. Widen the window?`;
  }
  if (sourceState === "no_history") {
    return "No message history yet. The first operator or agent exchange populates this signal.";
  }
  if (sourceState === "stale_or_error") {
    return "Message activity is stale or unavailable; the SQLite source may be down.";
  }
  return "Message traffic in the selected window and workspace.";
}

export function PulseStrip({ filters }: PulseStripProps) {
  const since = useMemo(
    () => nocWindowToSinceIso(filters.window),
    [filters.window],
  );
  const timeWindow = nocWindowToTimeSeriesWindow(filters.window);
  const noc = useOperationsNoc(filters);
  const writes = useTimeSeries("memory_writes", timeWindow);
  const modelUsage = useModelUsage(since);

  const metrics = noc.data?.metrics;
  const messageEnvelope = metrics?.memoryRows;
  const skillsEnvelope = metrics?.enabledSkills;
  const cronEnvelope = metrics?.cronWarnings;
  const agentSourceState =
    noc.data?.agentActivity?.sourceState ?? noc.data?.sourceStates?.agentActivity;
  const windowCopy = nocWindowLabel(filters.window);

  const supportsWorkspaceTelemetry = filters.workspace === "all";
  // ponytail: consolidation and model-usage records have no workspace key; withhold them rather than relabel global data.
  const writePoints = supportsWorkspaceTelemetry ? writes.data?.points ?? [] : [];
  const memoryWrites = writePoints.reduce((total, point) => total + point.value, 0);
  const memoryWritesStatus: MetricStatus = writes.isError
    ? "error"
    : writes.isLoading
      ? "blocked"
      : writePoints.length === 0
        ? "empty"
        : memoryWrites === 0
          ? "zero"
          : "live";

  const models = supportsWorkspaceTelemetry ? modelUsage.data?.usage.models ?? [] : [];
  const activeModels = models.filter(
    (model) => model.requests > 0 || model.totalTokens > 0,
  ).length;
  const modelsStatus: MetricStatus = modelUsage.isError
    ? "error"
    : modelUsage.isLoading
      ? "blocked"
      : activeModels > 0
        ? "live"
        : "empty";

  const cronWarnings =
    cronEnvelope?.value !== null && cronEnvelope?.value !== undefined
      ? cronEnvelope.value
      : cronEnvelope?.status === "empty"
        ? 0
        : null;

  const lastActivityStatus: MetricStatus =
    agentSourceState === "live"
      ? "live"
      : agentSourceState === "window_empty" || agentSourceState === "no_history"
        ? "empty"
        : agentSourceState === "stale_or_error"
          ? "error"
          : noc.isLoading
            ? "blocked"
            : "unavailable";

  const messageSemantic = sourceStateSemantic(
    agentSourceState,
    noc.isLoading,
    noc.isError || messageEnvelope?.status === "error",
  );
  const writesSemantic = !supportsWorkspaceTelemetry
    ? "stale_or_error"
    : measuredListSemantic(writePoints.length, writes.isLoading, writes.isError);
  const cronSemantic = envelopeSemantic(
    cronEnvelope,
    noc.isLoading,
    noc.isError,
    true,
  );
  const skillsSemantic = envelopeSemantic(
    skillsEnvelope,
    noc.isLoading,
    noc.isError,
  );
  const modelsSemantic = !supportsWorkspaceTelemetry
    ? "stale_or_error"
    : measuredListSemantic(activeModels, modelUsage.isLoading, modelUsage.isError);
  const lastActivitySemantic = sourceStateSemantic(
    agentSourceState,
    noc.isLoading,
    noc.isError,
  );

  const cards: PulseCard[] = [
    {
      label: `Messages · ${filters.window}`,
      value: valueFromEnvelope(messageEnvelope),
      semantic: messageSemantic,
      status: semanticToMetricStatus(messageSemantic),
      source: messageEnvelope?.source ?? "sqlite://messages",
      detail:
        messageEnvelope?.status === "live" || messageEnvelope?.status === "zero"
          ? sourceStateCopy("live", windowCopy)
          : sourceStateCopy(agentSourceState, windowCopy),
      observedAt: messageEnvelope?.observedAt ?? null,
    },
    {
      label: `Memory writes · ${filters.window}`,
      value:
        memoryWritesStatus === "live" || memoryWritesStatus === "zero"
          ? compactNumber(memoryWrites)
          : "—",
      semantic: writesSemantic,
      status: semanticToMetricStatus(writesSemantic),
      source: `/api/time-series?metric=memory_writes&window=${timeWindow}`,
      detail:
        !supportsWorkspaceTelemetry
          ? "Memory-write timing is not workspace-partitioned, so global timing is withheld for this selection."
          : writes.isError
            ? "Memory-write timing is stale or unavailable; the time-series source may be down."
            : writes.isLoading
            ? `Loading memory-write timing for ${windowCopy}…`
            : writePoints.length === 0
              ? `No memory writes in ${windowCopy}. Successful consolidation populates this signal; widen the window if you expect older writes.`
              : `Successful consolidation writes in ${windowCopy}; workspace=${filters.workspace} is context only because this source is windowed across all workspaces.`,
      observedAt: writes.data?.timestamp ?? null,
    },
    {
      label: "Cron health",
      value:
        cronWarnings === null
          ? "—"
          : cronWarnings === 0
            ? "clear"
            : `${compactNumber(cronWarnings)} warning${cronWarnings === 1 ? "" : "s"}`,
      semantic: cronSemantic,
      status: semanticToMetricStatus(cronSemantic),
      source: cronEnvelope?.source ?? "sqlite://cron_health_jobs",
      detail:
        cronWarnings === 0
          ? "No active cron warnings in the current health snapshot."
          : cronWarnings && cronWarnings > 0
            ? "Active cron jobs need operator attention."
            : cronEnvelope?.reason ?? "Cron health is unavailable.",
      observedAt: cronEnvelope?.observedAt ?? null,
    },
    {
      label: "Skills enabled",
      value: valueFromEnvelope(skillsEnvelope),
      semantic: skillsSemantic,
      status: semanticToMetricStatus(skillsSemantic),
      source: skillsEnvelope?.source ?? "sqlite://skill_registry",
      detail:
        skillsEnvelope?.status === "empty"
          ? "No enabled skills yet. Enable a registry skill to populate this current snapshot."
          : "Enabled skills in the current registry snapshot.",
      observedAt: skillsEnvelope?.observedAt ?? null,
    },
    {
      label: `Active models · ${filters.window}`,
      value: modelsStatus === "live" ? compactNumber(activeModels) : "—",
      semantic: modelsSemantic,
      status: semanticToMetricStatus(modelsSemantic),
      source: "/api/model-usage",
      detail:
        modelUsage.isError
          ? "Model usage is stale or unavailable; the ledger source may be down."
          : modelUsage.isLoading
            ? `Loading active models for ${windowCopy}…`
            : !supportsWorkspaceTelemetry
              ? "Model usage is not workspace-partitioned, so global model counts are withheld for this selection."
              : activeModels === 0
                ? `No model usage in ${windowCopy}. The first model request populates this signal.`
                : `Models with measured requests or tokens in ${windowCopy}.`,
      observedAt: modelUsage.data?.timestamp ?? null,
    },
    {
      label: "Last activity",
      value:
        lastActivityStatus === "live"
          ? formatObservedAt(noc.data?.agentActivity?.observedAt ?? null)
          : "—",
      semantic: lastActivitySemantic,
      status: semanticToMetricStatus(lastActivitySemantic),
      source: noc.data?.agentActivity?.source ?? "sqlite://messages",
      detail: sourceStateCopy(agentSourceState, windowCopy),
      observedAt: noc.data?.agentActivity?.observedAt ?? null,
    },
  ];

  return (
    <section style={{ padding: "0 28px 14px" }} aria-label="System pulse">
      <div
        data-mobile-grid="pulse"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            data-card-label={card.label}
            style={{
              background: NOC.paper,
              border: `1px solid ${NOC.rule}`,
              minWidth: 0,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Eyebrow>{card.label}</Eyebrow>
              <SourceStatusBadge status={card.status} />
            </div>
            <div
              style={{
                color: NOC.ink,
                fontFamily: NOC_FONT_MONO,
                fontSize: card.label === "Last activity" ? 13 : 22,
                fontWeight: 700,
                lineHeight: 1.2,
                marginTop: 8,
                overflowWrap: "anywhere",
              }}
            >
              {card.value}
            </div>
            <div
              data-status-block={card.semantic}
              data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
              style={{
                color:
                  card.status === "error"
                    ? NOC.terra
                    : card.status === "stale" || card.status === "degraded"
                      ? NOC.warn
                      : NOC.soft,
                fontFamily: NOC_FONT_MONO,
                fontSize: 10.5,
                lineHeight: 1.45,
                marginTop: 7,
                overflowWrap: "anywhere",
              }}
            >
              {card.detail}
            </div>
            <div
              style={{
                borderTop: `1px solid ${NOC.rule}`,
                color: NOC.soft,
                fontFamily: NOC_FONT_MONO,
                fontSize: 9.5,
                lineHeight: 1.4,
                marginTop: 8,
                overflowWrap: "anywhere",
                paddingTop: 6,
              }}
            >
              source: {card.source}
              {card.observedAt ? ` · observed ${formatObservedAt(card.observedAt)}` : ""}
            </div>
          </div>
        ))}
      </div>
      {noc.isError ? (
        <div
          style={{
            background: NOC.peach,
            border: `1px solid ${NOC.peach}`,
            color: NOC.terra,
            fontSize: 12,
            marginTop: 10,
            padding: "8px 12px",
          }}
        >
          Failed to load /api/operations/noc. Each independent pulse source remains visibly marked above.
        </div>
      ) : null}
    </section>
  );
}
