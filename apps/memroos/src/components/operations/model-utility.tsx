"use client";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { useModelUsage } from "@/lib/api-client";
import { nocWindowLabel, nocWindowToSinceIso, type NocFilters } from "@/lib/noc-filters";
import { Mono, NocCard, NocPanelHeader, PillBtn, SourceStatusBadge } from "./noc-primitives";

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

interface ModelUtilityProps {
  filters?: NocFilters;
}

export function ModelUtility({ filters }: ModelUtilityProps) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const since = nocWindowToSinceIso(effectiveFilters.window);
  const { data, isLoading, isError, error } = useModelUsage(since);
  const models = data?.usage.models.slice(0, 5) ?? [];
  const totalTokens =
    (data?.usage.total.inputTokens ?? 0) + (data?.usage.total.outputTokens ?? 0);

  type LocalStatus =
    | "live"
    | "zero"
    | "empty"
    | "stale"
    | "blocked"
    | "unavailable"
    | "degraded"
    | "error";
  let panelStatus: LocalStatus = "blocked";
  let panelReason: string | null = null;
  if (isError) {
    panelStatus = "error";
    panelReason = error instanceof Error ? error.message : "Failed to load /api/model-usage";
  } else if (isLoading) {
    panelStatus = "blocked";
    panelReason = "Loading /api/model-usage";
  } else if (!data) {
    panelStatus = "unavailable";
    panelReason = "No response from /api/model-usage";
  } else if (data.usage.total.requests === 0) {
    panelStatus = "empty";
    panelReason = `Healthy /api/model-usage returned no requests in the last ${nocWindowLabel(effectiveFilters.window)}`;
  } else {
    panelStatus = models.length === 0 ? "degraded" : "live";
  }

  return (
    <NocCard>
      <NocPanelHeader
        title="Model utility"
        hint={`Claude usage ledger from /api/model-usage since=${since}. Quality routing needs model-routing telemetry (still TBD). Scope: window=${effectiveFilters.window}.`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SourceStatusBadge status={panelStatus} />
            <PillBtn href="/ledger">Re-route</PillBtn>
          </div>
        }
      />
      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 70px 80px 90px 1fr",
          padding: "8px 0",
          fontSize: 10,
          color: NOC.soft,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          borderBottom: `1px solid ${NOC.rule}`,
        }}
      >
        <div>Model</div>
        <div>Requests</div>
        <div>Tokens</div>
        <div>Share</div>
        <div>Status</div>
      </div>

      {isLoading && (
        <div style={{ padding: "18px 0", fontSize: 12, color: NOC.soft }}>
          Loading model usage...
        </div>
      )}

      {isError && (
        <div
          style={{
            padding: "10px 12px",
            background: NOC.peach,
            border: `1px solid ${NOC.peach}`,
            color: NOC.terra,
            fontSize: 12,
            fontFamily: NOC_FONT_MONO,
            lineHeight: 1.4,
          }}
        >
          Failed to load `/api/model-usage`; routing quality is unavailable. {panelReason}
        </div>
      )}

      {!isLoading && !isError && panelStatus === "empty" && (
        <div
          style={{
            padding: "18px 0",
            fontSize: 12,
            color: NOC.muted,
            lineHeight: 1.5,
          }}
          data-status-block="empty-models"
        >
          {panelReason} Cost and quality recommendations are withheld until model telemetry exists.
        </div>
      )}

      {!isLoading && !isError && panelStatus === "degraded" && models.length === 0 && (
        <div
          style={{
            padding: "18px 0",
            fontSize: 12,
            color: NOC.warn,
            lineHeight: 1.5,
          }}
        >
          /api/model-usage returned aggregate tokens but no per-model rows. Quality recommendations are unavailable.
        </div>
      )}

      {models.map((m, i) => {
        const share = totalTokens > 0 ? m.totalTokens / totalTokens : 0;
        return (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 70px 80px 90px 1fr",
              padding: "10px 0",
              fontSize: 12.5,
              alignItems: "center",
              borderBottom: `1px solid ${NOC.rule}`,
            }}
          >
            {/* Model name + flag */}
            <div
              style={{
                fontFamily: NOC_FONT_MONO,
                color: NOC.ink,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
              }}
            >
              {m.name}
              {i === 0 && (
                <span
                  style={{
                    fontSize: 9, padding: "1px 4px",
                    background: NOC.successBg, color: NOC.success,
                    fontWeight: 700, letterSpacing: "0.08em",
                  }}
                >
                  TOP
                </span>
              )}
            </div>

            <Mono size={12}>{m.requests}</Mono>
            <Mono size={12} color={NOC.muted}>{formatTokens(m.totalTokens)}</Mono>

            {/* Usage share bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ height: 4, width: 36, background: NOC.fog }}>
                <div
                  style={{
                    width: `${Math.max(4, share * 100)}%`,
                    height: "100%",
                    background: share >= 0.5 ? NOC.success : NOC.ink,
                  }}
                />
              </div>
              <Mono size={11}>{Math.round(share * 100)}%</Mono>
            </div>

            <div style={{ fontSize: 11.5, color: NOC.soft }}>quality source pending</div>
          </div>
        );
      })}

      <div style={{ marginTop: 8, fontSize: 11.5, color: NOC.soft, lineHeight: 1.5 }}>
        Source: <span style={{ fontFamily: NOC_FONT_MONO, fontSize: 11 }}>/api/model-usage</span>.
        Window: <span style={{ fontFamily: NOC_FONT_MONO, fontSize: 11 }}>{nocWindowLabel(effectiveFilters.window)}</span>.
        Quality telemetry is currently withheld so model-utility shows measured token totals only.
      </div>
    </NocCard>
  );
}
