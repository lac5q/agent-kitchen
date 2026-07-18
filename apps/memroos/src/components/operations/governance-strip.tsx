
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
  const scopeNote = `Source feeds are recent snapshots — window=${effectiveFilters.window}, workspace=${effectiveFilters.workspace} filters do not partition these metrics. ${nocWindowLabel(effectiveFilters.window)} for context only.`;
  return (
    <NocCard>
      <NocPanelHeader
        title="Governance & trust"
        hint={scopeNote}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
          {security.isError || hil.isError || audit.isError ? (
            <div style={{ color: NOC.terra }}>A governance source failed to load.</div>
          ) : events.length === 0 ? (
            <div style={{ color: NOC.soft }}>No recent audit events returned by /api/audit-log.</div>
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
