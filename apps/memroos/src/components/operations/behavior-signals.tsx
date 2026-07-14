"use client";


import { useState } from "react";
import { useEscalations, useMemoryStats, useModelRoutingDashboard, useSecurityReport, useSkills } from "@/lib/api-client";
import { nocWindowLabel, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { PillBtn, severityColor } from "./noc-primitives";
import type { SignalSeverity } from "./noc-primitives";

interface LiveSignal {
  severity: SignalSeverity;
  title: string;
  body: string;
  tag: string;
  href: string;
}

export function BehaviorSignals({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };  const [dismissed, setDismissed] = useState<Set<number>>(() => new Set());
  const security = useSecurityReport(20);
  const escalations = useEscalations({ status: "all", limit: 20 });
  const skills = useSkills();
  const modelRouting = useModelRoutingDashboard(50);
  const memory = useMemoryStats();
  const signals: LiveSignal[] = [];

  const highSecurity = security.data?.summary.highSeverity ?? 0;
  if (highSecurity > 0) {
    signals.push({
      severity: "high",
      title: `${highSecurity} high-severity security events`,
      body: "Open the audit trail before trusting this surface.",
      tag: "security · audit",
      href: "/audit",
    });
  }
  const openEscalations = escalations.data?.escalations.filter((e) => e.status !== "resolved") ?? [];
  if (openEscalations.length > 0) {
    signals.push({
      severity: "high",
      title: `${openEscalations.length} open HIL escalations`,
      body: "Review pending human decisions and SLA deadlines.",
      tag: "hil · escalation",
      href: "/escalations",
    });
  }
  const driftingSkills = skills.data?.skillDetails.filter((skill) => skill.health !== "ready") ?? [];
  if (driftingSkills.length > 0) {
    signals.push({
      severity: "med",
      title: `${driftingSkills.length} skills need review`,
      body: "Coverage gaps, stale sources, or needs-source health are present in the skill registry.",
      tag: "skills · review",
      href: "/skills",
    });
  }
  const failedRoutes = modelRouting.data?.events.filter((event) => !event.success).length ?? 0;
  if (failedRoutes > 0) {
    signals.push({
      severity: "med",
      title: `${failedRoutes} model-routing failures`,
      body: "Model routing telemetry contains failed runs in the loaded window.",
      tag: "models · routing",
      href: "/ledger",
    });
  }
  const pendingMemory = memory.data?.pendingUnconsolidated ?? 0;
  if (pendingMemory > 0) {
    signals.push({
      severity: "low",
      title: `${pendingMemory} messages pending consolidation`,
      body: "New memories will not appear until consolidation succeeds.",
      tag: "memory · consolidation",
      href: "/notebooks",
    });
  }
  const sourceFailed = security.isError || escalations.isError || skills.isError || modelRouting.isError || memory.isError;
  if (sourceFailed) {
    signals.push({
      severity: "high",
      title: "One or more NOC sources failed",
      body: "At least one of /api/security/report, /api/escalations, /api/skills, /api/model-routing/telemetry, or /api/memory-stats failed to load.",
      tag: "source · failed",
      href: "/audit",
    });
  }

  const visibleSignals = signals
    .map((signal, index) => ({ signal, index }))
    .filter(({ index }) => !dismissed.has(index));

  function dismissSignal(index: number) {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }

  return (
    <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}` }}>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${NOC.rule}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: NOC.ink }}>
          Behavior signals · things to dig into
        </div>
        <span style={{ fontSize: 11.5, color: NOC.soft }}>
          {visibleSignals.length} visible · {signals.length} live sources
        </span>
        <div style={{ marginLeft: "auto" }}>
          <PillBtn href="/evals">Tune thresholds</PillBtn>
        </div>
      </div>

      {visibleSignals.length === 0 && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: NOC.soft }}>
          No live behavior signals from the loaded sources.
        </div>
      )}
      {visibleSignals.map(({ signal: a, index }) => {
        const sevColor = severityColor(a.severity);
        return (
          <div
            key={index}
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${NOC.rule}`,
              display: "grid",
              gridTemplateColumns: "12px 1fr auto",
              gap: 12,
              alignItems: "start",
            }}
          >
            <span
              style={{
                width: 6, height: 6,
                background: sevColor,
                borderRadius: 99,
                marginTop: 6,
                display: "inline-block",
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: NOC.ink }}>
                {a.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: NOC.muted,
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                {a.body}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: NOC.soft,
                  fontFamily: NOC_FONT_MONO,
                }}
              >
                {a.tag}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <PillBtn onClick={() => dismissSignal(index)}>Dismiss</PillBtn>
              <PillBtn href={a.href} variant="solid">Open</PillBtn>
            </div>
          </div>
        );
      })}
    </div>
  );
}
