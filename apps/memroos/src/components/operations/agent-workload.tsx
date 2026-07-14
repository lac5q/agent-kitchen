"use client";

import { HBars } from "@/components/shared/charts";
import { useAgentPeers, useAgents, useHiveFeed } from "@/lib/api-client";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

export function AgentWorkload() {
  const agents = useAgents();
  const hive = useHiveFeed(500);
  const peers = useAgentPeers(1440);
  const actions = hive.data?.actions ?? [];
  const agentCounts = new Map<string, number>();
  for (const action of actions) {
    agentCounts.set(action.agent_id, (agentCounts.get(action.agent_id) ?? 0) + 1);
  }
  const rows = Array.from(agentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([agentId, value]) => ({ label: agentId, value, color: NOC.ink }));
  const activeCount = agents.data?.agents.filter((a) => a.status === "active").length ?? peers.data?.peers.length ?? 0;
  const top = rows[0];
  const errorCount = actions.filter((a) => a.action_type === "error").length;

  type LocalStatus =
    | "live"
    | "empty"
    | "degraded"
    | "error";
  const panelStatus: LocalStatus = hive.isError
    ? "error"
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
        title="Agent workload · last 24h (cumulative)"
        hint="Live hive actions and active peer state. Hive count reflects a fixed 1440-minute rollup window across all workspaces — workspace and selected filters cannot partition this metric."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Mono color={NOC.soft} size={11}>
              {activeCount} active
            </Mono>
            <SourceStatusBadge status={panelStatus} />
          </div>
        }
      />
      {hive.isError && (
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
            <span style={{ fontSize: 12, color: NOC.ink }}>{top?.label ?? "None"}</span>
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
            <Mono color={errorCount ? NOC.terra : NOC.success} size={12}>
              {errorCount} errors
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
        source: {hive.isError ? "hive unavailable" : "sqlite://hive"} · observed at {hive.dataUpdatedAt ?? "—"} · scope: fixed 1440-minute rollup, cumulative across all workspaces
      </div>
    </NocCard>
  );
}
