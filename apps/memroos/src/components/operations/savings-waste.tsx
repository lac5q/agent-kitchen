
"use client";

import { useState } from "react";
import { Spark } from "@/components/shared/charts";
import { useDelegations, useHiveFeed, useModelUsage, useSkills } from "@/lib/api-client";
import { nocWindowLabel, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

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