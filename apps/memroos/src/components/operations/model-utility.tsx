"use client";

import { useModelRoutingDashboard } from "@/lib/api-client";
import { LOCAL_NOC_AGENT_IDS, nocWindowLabel, nocWindowToSinceIso, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { Mono, NocCard, NocPanelHeader, PillBtn, SourceStatusBadge } from "./noc-primitives";

const LOCAL_AGENT_IDS = new Set<string>(LOCAL_NOC_AGENT_IDS);
type Semantic = "live" | "window_empty" | "no_history" | "stale_or_error" | "loading";

function inWorkspace(agentId: string | null, workspace: NocFilters["workspace"]): boolean {
  if (workspace === "all") return true;
  if (!agentId) return false;
  return workspace === "local" ? LOCAL_AGENT_IDS.has(agentId) : !LOCAL_AGENT_IDS.has(agentId);
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function ModelUtility({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const since = Date.parse(nocWindowToSinceIso(effectiveFilters.window));
  const routing = useModelRoutingDashboard(200);
  const history = (routing.data?.events ?? []).filter((event) => inWorkspace(event.agentId, effectiveFilters.workspace));
  const events = history.filter((event) => Date.parse(event.createdAt) >= since);
  const models = Array.from(events.reduce((rows, event) => {
    const row = rows.get(event.model) ?? { name: event.model, requests: 0, totalTokens: 0 };
    row.requests += 1;
    row.totalTokens += event.inputTokens + event.outputTokens;
    rows.set(event.model, row);
    return rows;
  }, new Map<string, { name: string; requests: number; totalTokens: number }>()).values())
    .sort((a, b) => b.totalTokens - a.totalTokens || a.name.localeCompare(b.name));
  const totalTokens = models.reduce((total, model) => total + model.totalTokens, 0);
  const semantic: Semantic = routing.isError
    ? "stale_or_error"
    : routing.isLoading
      ? "loading"
      : models.length > 0
        ? "live"
        : history.length > 0
          ? "window_empty"
          : "no_history";
  const status = semantic === "live" ? "live" : semantic === "stale_or_error" ? "error" : "empty";

  return <NocCard>
    <NocPanelHeader
      title={`Model utility · ${nocWindowLabel(effectiveFilters.window)}`}
      hint={`Measured model-routing ledger rows filtered by window=${effectiveFilters.window}, workspace=${effectiveFilters.workspace}.`}
      right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><SourceStatusBadge status={routing.isLoading ? "blocked" : status} label={routing.isLoading ? "loading" : semantic} /><PillBtn href="/ledger">Re-route</PillBtn></div>}
    />
    {routing.isLoading ? <div style={{ color: NOC.soft, fontSize: 12 }}>Loading model utility…</div> : semantic !== "live" ? <div data-status-block={semantic} style={{ background: semantic === "stale_or_error" ? NOC.warnBg : NOC.fog, border: `1px solid ${semantic === "stale_or_error" ? NOC.warn : NOC.rule}`, color: semantic === "stale_or_error" ? NOC.warn : NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 11.5, lineHeight: 1.5, padding: "12px 10px" }}>
      {semantic === "stale_or_error" ? "Model utility is stale or unavailable; the routing ledger may be down." : semantic === "window_empty" ? `Nothing in ${nocWindowLabel(effectiveFilters.window)} for workspace=${effectiveFilters.workspace}; matching model ledger history exists outside this window. Widen the window?` : `No model utility history yet for workspace=${effectiveFilters.workspace}. The first routed model request populates this panel.`}
    </div> : <div style={{ display: "grid", gap: 7 }} data-filters={`window=${effectiveFilters.window}&workspace=${effectiveFilters.workspace}`}>
      {models.map((model, index) => {
        const share = totalTokens ? model.totalTokens / totalTokens : 0;
        return <div key={model.name} data-model={model.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 80px 70px", gap: 8, alignItems: "center", borderTop: `1px solid ${NOC.rule}`, paddingTop: 7, fontSize: 12 }}><span style={{ color: NOC.ink, fontFamily: NOC_FONT_MONO }}>{model.name}{index === 0 ? " · top" : ""}</span><Mono size={12}>{model.requests}</Mono><Mono size={12}>{formatTokens(model.totalTokens)}</Mono><Mono size={12}>{Math.round(share * 100)}%</Mono></div>;
      })}
    </div>}
    <div style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 10, marginTop: 10 }}>source: sqlite://model_routing_events · filters: {effectiveFilters.window}/{effectiveFilters.workspace}</div>
  </NocCard>;
}
