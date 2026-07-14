"use client";


import { HBars } from "@/components/shared/charts";
import { useAgentPeers, useAgents, useHiveFeed } from "@/lib/api-client";
import { nocWindowLabel, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

export function AgentWorkload({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const agents = useAgents();
  const hive = useHiveFeed(500);
  const peers = useAgentPeers(1440);  const actions = hive.data?.actions ?? [];
  const agentCounts = new Map<string, number>();
  for (const action of actions) {
    agentCounts.set(action.agent_id, (agentCounts.get(action.agent_id) ?? 0) + 1);
  }
  const rows = Array.from(agentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([agentId, value]) => ({ label: agentId, value, color: NOC.ink }));

  const agentsOk = !agents.isError && !agents.isLoading && agents.data !== undefined;

  const peersOk = !peers.isError && !peers.isLoading && peers.data !== undefined;
  const hiveOk = !hive.isError && !hive.isLoading && hive.data !== undefined;
  const activeCount = agentsOk
    ? agents.data!.agents.filter((a) => a.status === "active").length
    : peersOk
      ? peers.data!.peers.length
      : null;
  const top = rows[0];
  const errorCount = hiveOk ? actions.filter((a) => a.action_type === "error").length : null;

  type LocalStatus =
    | "live"
    | "empty"
    | "degraded"
    | "error";
  const panelStatus: LocalStatus = hive.isError    ? "error"
    : hive.isLoading
      ? "degraded"
      : rows.length === 0
        ? "empty"
        : "live";
  const panelReason = hive.isError
    ? "Failed to load /api/hive"
    : hive.isLoading
      ? "Loading /api/hive and /api/agents"
      : rows.length === 0
        ? "Healthy /api/hive has no actions in the last 1440 minutes"
        : null;

  return (
    <NocCard>
      <NocPanelHeader
        title={`Agent workload · ${nocWindowLabel(effectiveFilters.window)} context`}
        // Hive data is a fixed 1440-minute cumulative rollup — window/workspace
        // selections cannot partition this metric. Disclose that explicitly.
        hint={`Live hive actions + active peer state. Scope is a fixed 1440-minute cumulative rollup across all workspaces — window=${effectiveFilters.window} and workspace=${effectiveFilters.workspace} filters do not partition this metric.`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Mono color={NOC.soft} size={11}>
              {activeCount !== null ? `${activeCount} active` : "— active"}
            </Mono>
            <SourceStatusBadge status={panelStatus} />
          </div>
        }
      />      {hive.isError && (
        <div style={{ fontSize: 12, color: NOC.terra, fontFamily: NOC_FONT_MONO, marginBottom: 8 }}>
          {panelReason}
        </div>
      )}
      {!hive.isError && rows.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: NOC.soft,
            lineHeight: 1.5,
            padding: "8px 10px",
            background: NOC.fog,
            border: `1px solid ${NOC.rule}`,
          }}
          data-status-block="empty-hive"
        >
          {panelReason ?? "Healthy /api/hive returned zero actions. The workload panel is empty by design."}
        </div>
      ) : (
        <HBars rows={rows} />
      )}

      <div
        style={{
          marginTop: 14,
          borderTop: `1px solid ${NOC.rule}`,
          paddingTop: 10,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <div>
          <Eyebrow>Top earner</Eyebrow>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: NOC.ink }}>{top?.label ?? "—"}</span>
            <Mono color={top ? NOC.success : NOC.cold} size={12}>
              {top ? `${top.value} actions` : "no source"}
            </Mono>
          </div>
        </div>
        <div>
          <Eyebrow>Failed work</Eyebrow>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: NOC.ink, fontFamily: NOC_FONT_MONO }}>/api/hive</span>
            <Mono color={errorCount === null ? NOC.soft : errorCount ? NOC.terra : NOC.success} size={12}>
              {errorCount === null ? "—" : `${errorCount} errors`}
            </Mono>
          </div>
        </div>
      </div>
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
        source: {hive.isError ? "hive unavailable" : "sqlite://hive"} · observed at {hive.dataUpdatedAt ?? "—"} · scope: fixed 1440-minute cumulative rollup across all workspaces (window={effectiveFilters.window}, workspace={effectiveFilters.workspace} not applied)
      </div>
    </NocCard>
  );
}