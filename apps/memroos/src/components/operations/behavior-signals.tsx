"use client";


import { useState } from "react";
import { useEscalations, useMemoryStats, useModelRoutingDashboard, useSecurityReport, useSkills } from "@/lib/api-client";
import { type NocFilters, type NocWindow, type NocWorkspace } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { PillBtn, severityColor } from "./noc-primitives";
import type { SignalSeverity } from "./noc-primitives";

interface DrilldownDestination {
  href: string;
  scopeNote: string;
}

const BEHAVIOR_DRILLDOWNS: Record<string, DrilldownDestination> = {
  "/audit": {
    href: "/audit",
    scopeNote:
      "Audit page has its own date-range selector; originating NOC filters are shown for reference only and are NOT applied to the audit query.",
  },
  "/escalations": {
    href: "/escalations",
    scopeNote:
      "Escalations page has its own status filter; originating NOC filters are shown for reference only and are NOT applied.",
  },
  "/skills": {
    href: "/skills",
    scopeNote:
      "Skills registry is a cumulative snapshot; originating NOC filters are shown for reference only and are NOT applied.",
  },
  "/ledger": {
    href: "/ledger",
    scopeNote:
      "Ledger has its own date-range selector; originating NOC filters are shown for reference only and are NOT applied.",
  },
  "/notebooks": {
    href: "/notebooks",
    scopeNote:
      "Memory page has its own filters; originating NOC filters are shown for reference only and are NOT applied.",
  },
};

function buildDrilldownHref(
  destination: DrilldownDestination,
  filters: { window: NocWindow; workspace: NocWorkspace }
): string {
  const params = new URLSearchParams();
  params.set("from_window", filters.window);
  params.set("from_workspace", filters.workspace);
  params.set("from_scope_note", destination.scopeNote);
  return `${destination.href}?${params.toString()}`;
}

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
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/audit"], effectiveFilters),
    });
  }
  const openEscalations = escalations.data?.escalations.filter((e) => e.status !== "resolved") ?? [];
  if (openEscalations.length > 0) {
    signals.push({
      severity: "high",
      title: `${openEscalations.length} open HIL escalations`,
      body: "Review pending human decisions and SLA deadlines.",
      tag: "hil · escalation",
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/escalations"], effectiveFilters),
    });
  }
  const driftingSkills = skills.data?.skillDetails.filter((skill) => skill.health !== "ready") ?? [];
  if (driftingSkills.length > 0) {
    signals.push({
      severity: "med",
      title: `${driftingSkills.length} skills need review`,
      body: "Coverage gaps, stale sources, or needs-source health are present in the skill registry.",
      tag: "skills · review",
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/skills"], effectiveFilters),
    });
  }
  const failedRoutes = modelRouting.data?.events.filter((event) => !event.success).length ?? 0;
  if (failedRoutes > 0) {
    signals.push({
      severity: "med",
      title: `${failedRoutes} model-routing failures`,
      body: "Model routing telemetry contains failed runs in the loaded window.",
      tag: "models · routing",
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/ledger"], effectiveFilters),
    });
  }
  const pendingMemory = memory.data?.pendingUnconsolidated ?? 0;
  if (pendingMemory > 0) {
    signals.push({
      severity: "low",
      title: `${pendingMemory} messages pending consolidation`,
      body: "New memories will not appear until consolidation succeeds.",
      tag: "memory · consolidation",
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/notebooks"], effectiveFilters),
    });
  }
  const sourceFailed = security.isError || escalations.isError || skills.isError || modelRouting.isError || memory.isError;
  if (sourceFailed) {
    signals.push({
      severity: "high",
      title: "One or more NOC sources failed",
      body: "At least one of /api/security/report, /api/escalations, /api/skills, /api/model-routing/telemetry, or /api/memory-stats failed to load.",
      tag: "source · failed",
      href: buildDrilldownHref(BEHAVIOR_DRILLDOWNS["/audit"], effectiveFilters),
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
          <PillBtn
            href={(() => {
              const params = new URLSearchParams();
              params.set("from_window", effectiveFilters.window);
              params.set("from_workspace", effectiveFilters.workspace);
              params.set(
                "from_scope_note",
                "Evals page has its own config; originating NOC filters are shown for reference only and are NOT applied."
              );
              return `/evals?${params.toString()}`;
            })()}
          >
            Tune thresholds
          </PillBtn>
        </div>
      </div>
      <div
        style={{
          padding: "8px 16px",
          fontSize: 10.5,
          color: NOC.soft,
          fontFamily: NOC_FONT_MONO,
          background: NOC.fog,
          borderBottom: `1px solid ${NOC.rule}`,
          lineHeight: 1.4,
        }}
        data-scope-disclosure="behavior-signals"
      >
        Fixed-scope feeds — /api/security/report, /api/escalations, /api/skills,
        /api/model-routing/telemetry, and /api/memory-stats do not partition by
        the selected NOC window or workspace. window={effectiveFilters.window},
        workspace={effectiveFilters.workspace} are forwarded to drilldowns for
        destination-side disclosure but are NOT applied here.
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
