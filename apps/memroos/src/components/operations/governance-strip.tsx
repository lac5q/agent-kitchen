
"use client";


import { useAuditLog, useOrchestrationHil, useSecurityReport } from "@/lib/api-client";
import { type MetricStatus } from "@/lib/metric-status";
import { nocWindowLabel, type NocFilters } from "@/lib/noc-filters";
import { NOC } from "@/lib/noc-theme";
import { NocCard, NocPanelHeader, Eyebrow, Mono, SourceStatusBadge } from "./noc-primitives";
export function GovernanceStrip({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const security = useSecurityReport(20);
  const hil = useOrchestrationHil();
  const audit = useAuditLog(20);
  const workspaceUnsupported = effectiveFilters.workspace !== "all";
  // Each row independently evaluates its source state. Failed sources do
  // NOT coerce to 0 — they render "—" with an explicit reason.
  const securityOk = !security.isError && !security.isLoading && security.data !== undefined;
  const hilOk = !hil.isError && !hil.isLoading && hil.data !== undefined;
  const auditOk = !audit.isError && !audit.isLoading && audit.data !== undefined;
  const blockedAttempts = securityOk ? security.data!.summary.blockedAttempts : null;
  const hilApprovals = hilOk ? hil.data!.decisions.length : null;
  const securityEvents = securityOk ? security.data!.summary.securityEvents : null;
  const auditLines = auditOk ? audit.data!.entries.length : null;
  const sourceFailed = security.isError || hil.isError || audit.isError;
  const sourceLoading = security.isLoading || hil.isLoading || audit.isLoading;
  const panelStatus: MetricStatus = sourceFailed
    ? "error"
    : sourceLoading
      ? "blocked"
      : (securityEvents ?? 0) + (hilApprovals ?? 0) + (auditLines ?? 0) > 0
        ? "live"
        : "zero";
  const stats = [
    {
      label: "Blocked attempts",
      value: blockedAttempts,
      sub: securityOk
        ? "security report"
        : security.isError
          ? "source failed"
          : "loading source",
      color: blockedAttempts && blockedAttempts > 0 ? NOC.terra : NOC.success,
      ok: securityOk,
      loading: security.isLoading,
      errored: security.isError,
      source: "/api/security/report",
    },
    {
      label: "HIL approvals",
      value: hilApprovals,
      sub: hilOk
        ? "pending source"
        : hil.isError
          ? "source failed"
          : "loading source",
      color: NOC.warn,
      ok: hilOk,
      loading: hil.isLoading,
      errored: hil.isError,
      source: "/api/orchestration/hil",
    },
    {
      label: "Security events",
      value: securityEvents,
      sub: securityOk
        ? "loaded window"
        : security.isError
          ? "source failed"
          : "loading source",
      color: NOC.muted,
      ok: securityOk,
      loading: security.isLoading,
      errored: security.isError,
      source: "/api/security/report",
    },
    {
      label: "Audit lines",
      value: auditLines,
      sub: auditOk
        ? "recent"
        : audit.isError
          ? "source failed"
          : "loading source",
      color: NOC.ink,
      ok: auditOk,
      loading: audit.isLoading,
      errored: audit.isError,
      source: "/api/audit-log",
    },
  ];  const events = audit.data?.entries.slice(0, 4).map((entry) => ({
    time: new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    type: entry.action,
    detail: `${entry.actor} · ${entry.target}`,
  })) ?? [];


  // The /api/security, /api/audit, and /api/orchestration/hil endpoints do
  // NOT honor the selected NOC date or workspace. Disclose that explicitly.
  const scopeNote = `Global governance snapshot across all workspaces. Window=${effectiveFilters.window} is context only because audit feeds are not time-windowed.`;
  if (workspaceUnsupported) {
    return <NocCard>
      <NocPanelHeader title="Governance & trust" hint={`Governance sources have no workspace key; global audit data is withheld for workspace=${effectiveFilters.workspace}.`} right={<SourceStatusBadge status="error" label="stale_or_error" />} />
      <div data-status-block="stale_or_error" style={{ background: NOC.warnBg, border: `1px solid ${NOC.warn}`, color: NOC.warn, fontFamily: "monospace", fontSize: 11.5, lineHeight: 1.5, padding: "12px 10px" }}>
        Workspace-scoped governance is unavailable. Select all workspaces to view the global audit summary.
      </div>
    </NocCard>;
  }

  return (
    <NocCard>
      <NocPanelHeader
        title="Governance & trust"
        hint={scopeNote}
        right={<SourceStatusBadge status={panelStatus} />}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        {stats.map(({ label, value, sub, color, ok, loading, errored, source }) => {
          const state: MetricStatus = errored
            ? "error"
            : loading
              ? "blocked"
              : value === null
                ? "unavailable"
                : value === 0
                  ? "zero"
                  : "live";
          return (
            <div
              key={label}
              style={{
                borderLeft: `2px solid ${color}`,
                paddingLeft: 10,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
              data-gov-row={label}
              data-gov-state={state}
            >
              <Eyebrow>{label}</Eyebrow>
              <SourceStatusBadge status={state} />
              <Mono size={20}>{ok && value !== null ? String(value) : "—"}</Mono>
              <div style={{ fontSize: 11, color: NOC.soft, overflowWrap: "anywhere", lineHeight: 1.4 }}>
                {ok
                  ? `${sub} · ${value === 0 ? "measured zero" : "measured"} · ${source}`
                  : errored
                    ? `${sub} · ${source}`
                    : loading
                      ? `${sub} · ${source}`
                      : `${sub} · ${source}`}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 14,
          borderTop: `1px solid ${NOC.rule}`,
          paddingTop: 10,
        }}
      >
        <Eyebrow>Recent governance events</Eyebrow>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          {sourceFailed ? (
            <div data-status-block="stale_or_error" style={{ color: NOC.terra }}>
              Governance data is stale or unavailable; at least one source may be down.
            </div>
          ) : sourceLoading ? (
            <div style={{ color: NOC.soft }}>Loading governance history…</div>
          ) : events.length === 0 ? (
            <div data-status-block="no_history" style={{ color: NOC.soft }}>
              No governance history in the loaded audit snapshot. Operator and policy actions populate this trail.
            </div>
          ) : events.map((e, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "58px minmax(0, 1fr)",
                columnGap: 10,
                rowGap: 2,
                alignItems: "start",
              }}
            >
              <Mono color={NOC.soft} size={11}>{e.time}</Mono>
              <span style={{ color: NOC.muted, minWidth: 0, overflowWrap: "anywhere" }}>{e.type}</span>
              <span />
              <span style={{ color: NOC.ink, minWidth: 0, overflowWrap: "anywhere" }}>{e.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </NocCard>
  );
}
