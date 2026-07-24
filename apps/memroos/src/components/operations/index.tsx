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
const ModelUtility = dynamic(
  () => import("./model-utility").then((mod) => mod.ModelUtility),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const ActivityHeatmap = dynamic(
  () => import("./activity-heatmap").then((mod) => mod.ActivityHeatmap),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const Cost = dynamic(
  () => import("./savings-waste").then((mod) => mod.Cost),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const SkillsLifecycle = dynamic(
  () => import("./skills-lifecycle").then((mod) => mod.SkillsLifecycle),
  { ssr: false, loading: () => <div style={{ padding: "0 28px 14px" }}><NocPanelSkeleton height={260} /></div> }
);
const GovernanceStrip = dynamic(
  () => import("./governance-strip").then((mod) => mod.GovernanceStrip),
  { ssr: false, loading: () => <NocPanelSkeleton /> }
);
const EfficiencySignals = dynamic(
  () => import("./efficiency-signals").then((mod) => mod.EfficiencySignals),
  { ssr: false, loading: () => <NocPanelSkeleton height={260} /> }
);
const BehaviorSignals = dynamic(
  () => import("./behavior-signals").then((mod) => mod.BehaviorSignals),
  { ssr: false, loading: () => <NocPanelSkeleton height={260} /> }
);

/**
 * Phase 174 four-state semantic for the Agent Activity panel. The panel
 * is a direct read of the Phase 173 message-backed sourceState, so we
 * pass it through unchanged; only `noc.isError` / `noc.isLoading` are
 * promoted into `stale_or_error` so an endpoint failure cannot be
 * mistaken for `no_history`.
 */
function agentActivityPanelSemantic(
  sourceState: string | undefined,
  isLoading: boolean,
  isError: boolean
): "live" | "window_empty" | "no_history" | "stale_or_error" | "loading" {
  if (isError) return "stale_or_error";
  if (isLoading) return "loading";
  if (sourceState === "live") return "live";
  if (sourceState === "window_empty") return "window_empty";
  if (sourceState === "stale_or_error") return "stale_or_error";
  return "no_history";
}

/** Message-backed Agent Activity — hive delegations are additive only. */
export function AgentActivityPanel({ filters }: { filters: NocFilters }) {
  const noc = useOperationsNoc(filters);
  const activity = noc.data?.agentActivity;
  const agents = activity?.agents ?? [];
  const delegations = activity?.delegations ?? [];
  const sourceState = activity?.sourceState ?? noc.data?.sourceStates?.agentActivity;
  const reportedSemantic = agentActivityPanelSemantic(sourceState, noc.isLoading, noc.isError);
  const semantic =
    reportedSemantic === "live" && agents.length === 0
      ? "no_history"
      : reportedSemantic;
  const status =
    semantic === "live"
      ? "live"
      : semantic === "window_empty" || semantic === "no_history"
        ? "empty"
        : semantic === "loading"
          ? "blocked"
        : "error";
  const emptyCopy =
    semantic === "window_empty"
      ? `Nothing in ${nocWindowLabel(filters.window)}; message history exists outside this window. Widen the window?`
      : semantic === "stale_or_error"
        ? "Agent activity is stale or unavailable; the message source may be down."
        : "No agent message history yet. The first operator or agent exchange populates this panel.";

  return (
    <div data-testid="agent-activity-panel">
      <NocCard>
        <NocPanelHeader
          title={`Agent activity · ${nocWindowLabel(filters.window)}`}
          hint={
            delegations.length > 0
              ? "Per-agent message traffic from sqlite://messages, with delegation detail for the selected window."
              : "Per-agent message traffic from sqlite://messages."
          }
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Mono color={NOC.soft} size={11}>
                {noc.isLoading ? "loading" : `${agents.length} agent${agents.length === 1 ? "" : "s"}`}
              </Mono>
              <SourceStatusBadge status={status} label={semantic} />
            </div>
          }
        />
        {semantic !== "live" || agents.length === 0 ? (
          <div
            data-status-block={semantic}
            data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
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
          <div
            data-status-block="live"
            data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
            style={{ marginTop: 12, borderTop: `1px solid ${NOC.rule}`, paddingTop: 10 }}
          >
            <Eyebrow>Delegations</Eyebrow>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {delegations.map((delegation) => (
                <div
                  key={`${delegation.taskId}:${delegation.fromAgent}:${delegation.toAgent}`}
                  data-delegation-task={delegation.taskId}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: 8,
                    color: NOC.soft,
                    fontFamily: NOC_FONT_MONO,
                    fontSize: 11,
                  }}
                >
                  <span>{delegation.fromAgent} → {delegation.toAgent}</span>
                  <span>{delegation.status} · {formatObservedAt(delegation.updatedAt)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
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

const ADVANCED_PREFERENCE_KEY = "memroos:noc:show-advanced";

export function OperationsNoc() {
  const [windowLabel, setWindowLabel] = useState<NocWindow>("24h");
  const [workspace, setWorkspace] = useState<NocWorkspace>("all");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ADVANCED_PREFERENCE_KEY) === "true";
    } catch {
      // Storage can be disabled; the safe default remains off.
      return false;
    }
  });
  const filters = useMemo<NocFilters>(
    () => ({ window: windowLabel, workspace }),
    [windowLabel, workspace]
  );

  function handleShowAdvancedChange(value: boolean) {
    setShowAdvanced(value);
    try {
      window.localStorage.setItem(ADVANCED_PREFERENCE_KEY, String(value));
    } catch {
      // The control still works for this session when persistence is unavailable.
    }
  }

  return (
    <div
      style={{
        background: NOC.cream,
        fontFamily: NOC_FONT_BODY,
        color: NOC.ink,
        minHeight: "100%",
      }}
    >
      <div data-noc-section="header">
        <NocHeader
          windowLabel={windowLabel}
          workspace={workspace}
          showAdvanced={showAdvanced}
          onWindowChange={setWindowLabel}
          onWorkspaceChange={setWorkspace}
          onShowAdvancedChange={handleShowAdvancedChange}
        />
      </div>

      <div data-noc-section="pulse">
        <PulseStrip filters={filters} />
      </div>

      <div data-noc-section="attention">
        <AttentionPanel filters={filters} />
      </div>

      <div data-noc-section="memory" style={{ padding: "6px 28px 14px" }}>
        <MemoryConsumption filters={filters} />
      </div>

      <div
        data-noc-section="agent-model-activity"
        data-mobile-grid="agent-model-activity"
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

      <div data-noc-section="cost" style={{ padding: "0 28px 14px" }}>
        <Cost filters={filters} />
      </div>

      <div
        data-noc-section="governance-skills"
        data-mobile-grid="governance-skills"
        style={{
          padding: "0 28px 28px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <GovernanceStrip filters={filters} />
        <SkillsLifecycle filters={filters} />
      </div>

      {showAdvanced ? (
        <section
          aria-label="Advanced operations panels"
          data-noc-section="advanced"
          style={{ borderTop: `1px solid ${NOC.rule}`, paddingTop: 14 }}
        >
          <div style={{ padding: "0 28px 10px" }}>
            <Eyebrow>Advanced</Eyebrow>
            <div style={{ color: NOC.soft, fontSize: 11.5, marginTop: 3 }}>
              Optional or known-unwired signals, hidden from the default operator scan.
            </div>
          </div>
          <EfficiencySignals filters={filters} />
          <div style={{ padding: "0 28px 28px" }}>
            <BehaviorSignals filters={filters} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
