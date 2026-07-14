"use client";

import { useState } from "react";
import { Spark } from "@/components/shared/charts";
import { useDelegations, useHiveFeed, useModelUsage, useSkills } from "@/lib/api-client";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

export function Savings() {
  const [since24h] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const modelUsage = useModelUsage(since24h);
  const requests = modelUsage.data?.usage.total.requests ?? 0;
  const tokenTotal = modelUsage.data?.usage.total
    ? modelUsage.data.usage.total.inputTokens +
      modelUsage.data.usage.total.outputTokens +
      modelUsage.data.usage.total.cacheRead
    : 0;
  const spark = (modelUsage.data?.usage.models.slice(0, 12).map((model) => model.totalTokens) ?? [0, 0]);

  return (
    <NocCard>
      <NocPanelHeader
        title="Savings source"
        hint="Baseline savings are explicitly withheld until retained-memory baseline telemetry exists."
        right={<SourceStatusBadge status="blocked" label="baseline blocked" />}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }} data-status-block="savings-blocked">
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
        <Spark
          values={spark.length >= 2 ? spark : [0, tokenTotal]}
          color={NOC.success}
          w={280}
          h={40}
          fill
        />
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
        <span style={{ color: NOC.success }}>
          {requests} requests · {new Intl.NumberFormat("en", { notation: "compact" }).format(tokenTotal)} tokens
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

export function Waste() {
  const hive = useHiveFeed(200);
  const delegations = useDelegations(200);
  const skills = useSkills();
  const retries = hive.data?.actions.filter((a) => a.action_type === "error").length ?? 0;
  const blocks = delegations.data?.delegations.filter((d) => d.status === "failed" || d.status === "canceled").length ?? 0;
  const duplicateSkills = skills.data?.skillBudget.duplicateSkills.length ?? 0;
  const coldReads = skills.data?.coverageGaps.length ?? 0;

  type LocalStatus = "live" | "empty" | "degraded" | "error";
  const sourceFailed = hive.isError || delegations.isError || skills.isError;
  const panelStatus: LocalStatus = sourceFailed
    ? "error"
    : hive.isLoading || delegations.isLoading || skills.isLoading
      ? "degraded"
      : retries + blocks + duplicateSkills + coldReads === 0
        ? "empty"
        : "live";

  const rows = [
    { label: "Retries", value: String(retries), sub: "hive errors", color: retries ? NOC.terra : NOC.success },
    { label: "Blocks", value: String(blocks), sub: "failed dispatches", color: blocks ? NOC.warn : NOC.success },
    { label: "Duplicate skills", value: String(duplicateSkills), sub: "skill budget", color: duplicateSkills ? NOC.terra : NOC.success },
    { label: "Coverage gaps", value: String(coldReads), sub: "skill telemetry", color: coldReads ? NOC.warn : NOC.success },
  ];

  return (
    <NocCard>
      <NocPanelHeader
        title="Waste"
        hint="Retries, blocks, duplicate skills, cold-tier reads — counts are live from hive + skill budget feeds."
        right={<SourceStatusBadge status={panelStatus} />}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {rows.map(({ label, value, sub, color }) => (
          <div key={label}>
            <Eyebrow>{label}</Eyebrow>
            <Mono size={20} color={color}>
              {value}
            </Mono>
            <div style={{ fontSize: 11, color: NOC.soft }}>{sub}</div>
          </div>
        ))}
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
            ? hive.isError
              ? "Failed to load /api/hive. "
              : "" + (delegations.isError ? "Failed to load /api/delegations. " : "") + (skills.isError ? "Failed to load /api/skills. " : "")
            : "Waste metrics are live counts from hive, delegations, and skill budget telemetry."}
        </div>
      </div>
    </NocCard>
  );
}
