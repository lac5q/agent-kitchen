"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useOperationsNoc } from "@/lib/api-client";
import { nocWindowLabel, type NocFilters, type NocWindow, type NocWorkspace } from "@/lib/noc-filters";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";
import { NocHeader } from "./noc-header";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
  formatObservedAt,
} from "./noc-primitives";
import { PulseStrip } from "./pulse-strip";

function NocPanelSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      style={{
        minHeight: height,
        background: NOC.paper,
        border: `1px solid ${NOC.rule}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 42,
          borderBottom: `1px solid ${NOC.rule}`,
          background: NOC.fog,
        }}
      />
      <div style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ height: 14, width: "48%", background: NOC.rule }} />
        <div style={{ height: 40, background: NOC.rule }} />
        <div style={{ height: 40, background: NOC.rule }} />
      </div>
    </div>
  );
}

const AttentionPanel = dynamic(
  () => import("./attention-panel").then((mod) => mod.AttentionPanel),
  { ssr: false, loading: () => <div style={{ padding: "0 28px 14px" }}><NocPanelSkeleton height={190} /></div> }
);
const MemoryConsumption = dynamic(
  () => import("./memory-consumption").then((mod) => mod.MemoryConsumption),
  { ssr: false, loading: () => <NocPanelSkeleton height={320} /> }
);
const MemoryNotDigested = dynamic(
  () => import("./memory-not-digested").then((mod) => mod.MemoryNotDigested),
  { ssr: false, loading: () => <NocPanelSkeleton height={320} /> }
);
const ModelUtility = dynamic(
  () => import("./model-utility").then((mod) => mod.ModelUtility),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const ActivityHeatmap = dynamic(
  () => import("./activity-heatmap").then((mod) => mod.ActivityHeatmap),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const SkillsLifecycle = dynamic(
  () => import("./skills-lifecycle").then((mod) => mod.SkillsLifecycle),
  { ssr: false, loading: () => <div style={{ padding: "0 28px 14px" }}><NocPanelSkeleton height={260} /></div> }
);
const BehaviorSignals = dynamic(
  () => import("./behavior-signals").then((mod) => mod.BehaviorSignals),
  { ssr: false, loading: () => <NocPanelSkeleton height={260} /> }
);
const GovernanceStrip = dynamic(
  () => import("./governance-strip").then((mod) => mod.GovernanceStrip),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const Savings = dynamic(
  () => import("./savings-waste").then((mod) => mod.Savings),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const Waste = dynamic(
  () => import("./savings-waste").then((mod) => mod.Waste),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);

function agentActivityStatus(
  sourceState: string | undefined
): "live" | "empty" | "degraded" | "stale" {
  if (sourceState === "live") return "live";
  if (sourceState === "stale_or_error") return "degraded";
  if (sourceState === "window_empty" || sourceState === "no_history") return "empty";
  return "stale";
}

/** Message-backed Agent Activity — hive delegations are additive only. */
export function AgentActivityPanel({ filters }: { filters: NocFilters }) {
  const noc = useOperationsNoc(filters);
  const activity = noc.data?.agentActivity;
  const agents = activity?.agents ?? [];
  const delegations = activity?.delegations ?? [];
  const sourceState = activity?.sourceState ?? noc.data?.sourceStates?.agentActivity;
  const status = noc.isLoading ? "degraded" : agentActivityStatus(sourceState);
  const emptyCopy =
    sourceState === "window_empty"
      ? `No agent messages in ${nocWindowLabel(filters.window)}. Widen the window?`
      : sourceState === "stale_or_error"
        ? "Agent activity source is stale or unavailable."
        : "No agent messages yet. Activity appears from the first operator/agent exchange.";

  return (
    <div data-testid="agent-activity-panel">
      <NocCard>
        <NocPanelHeader
          title={`Agent activity · ${nocWindowLabel(filters.window)}`}
          hint="Per-agent message traffic from sqlite://messages. Hive delegation detail is additive when rows exist."
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Mono color={NOC.soft} size={11}>
                {noc.isLoading ? "loading" : `${agents.length} agent${agents.length === 1 ? "" : "s"}`}
              </Mono>
              <SourceStatusBadge status={status} />
            </div>
          }
        />
        {agents.length === 0 ? (
          <div
            data-status-block={sourceState ?? "no_history"}
            style={{
              fontSize: 12,
              color: NOC.soft,
              lineHeight: 1.5,
              padding: "8px 10px",
              background: NOC.fog,
              border: `1px solid ${NOC.rule}`,
            }}
          >
            {noc.isLoading ? "Loading agent activity…" : emptyCopy}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }} data-agent-activity="live">
            {agents.map((agent) => (
              <div
                key={agent.agentId}
                data-agent-id={agent.agentId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  borderTop: `1px solid ${NOC.rule}`,
                  paddingTop: 8,
                }}
              >
                <span style={{ fontSize: 12, color: NOC.ink }}>{agent.agentId}</span>
                <Mono color={NOC.soft} size={11}>
                  {agent.messageCount} msg · {agent.sessionCount} ses · {formatObservedAt(agent.lastMessageAt)}
                </Mono>
              </div>
            ))}
          </div>
        )}
        {delegations.length > 0 ? (
          <div style={{ marginTop: 12, borderTop: `1px solid ${NOC.rule}`, paddingTop: 10 }}>
            <Eyebrow>Delegations</Eyebrow>
            <div style={{ marginTop: 6, fontSize: 11, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
              {delegations.length} hive delegation{delegations.length === 1 ? "" : "s"} in window
            </div>
          </div>
        ) : null}
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: `1px solid ${NOC.rule}`,
            fontSize: 10.5,
            color: NOC.soft,
            fontFamily: NOC_FONT_MONO,
            lineHeight: 1.5,
          }}
        >
          source: {activity?.source ?? "sqlite://messages"} · state: {sourceState ?? "—"} · observed{" "}
          {formatObservedAt(activity?.observedAt ?? null)}
        </div>
      </NocCard>
    </div>
  );
}

export function OperationsNoc() {
  const [windowLabel, setWindowLabel] = useState<NocWindow>("24h");
  const [workspace, setWorkspace] = useState<NocWorkspace>("all");
  const filters = useMemo<NocFilters>(
    () => ({ window: windowLabel, workspace }),
    [windowLabel, workspace]
  );

  return (
    <div
      style={{
        background: NOC.cream,
        fontFamily: NOC_FONT_BODY,
        color: NOC.ink,
        minHeight: "100%",
      }}
    >
      {/* Header */}
      <NocHeader
        windowLabel={windowLabel}
        workspace={workspace}
        onWindowChange={setWindowLabel}
        onWorkspaceChange={setWorkspace}
      />

      {/* Row 1 — System pulse strip (6 KPIs) */}
      <PulseStrip filters={filters} />

      {/* Row 1.5 — operator actions */}
      <AttentionPanel filters={filters} />

      {/* Row 2 — Memory consumption + Memory not digested */}
      <div
        style={{
          padding: "6px 28px 14px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)",
          gap: 14,
        }}
      >
        <MemoryConsumption filters={filters} />
        <MemoryNotDigested filters={filters} />
      </div>


      {/* Row 3 — Agent activity (message-backed) + Model utility + Activity heatmap */}
      <div
        style={{
          padding: "0 28px 14px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        <AgentActivityPanel filters={filters} />
        <ModelUtility filters={filters} />
        <ActivityHeatmap filters={filters} />
      </div>

      {/* Row 4 — Skills lifecycle */}
      <SkillsLifecycle filters={filters} />

      {/* Row 5 — Behavior signals */}
      <div
        style={{
          padding: "0 28px 14px",
        }}
      >
        <BehaviorSignals filters={filters} />
      </div>

      {/* Row 6 — Governance + Savings + Waste */}
      <div
        style={{
          padding: "0 28px 28px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        <GovernanceStrip filters={filters} />
        <Savings filters={filters} />
        <Waste filters={filters} />
      </div>    </div>
  );
}
