
"use client";

import { useMemo } from "react";

import { useSealProposals, useSkills } from "@/lib/api-client";
import type { MetricStatus } from "@/lib/metric-status";
import {
  LOCAL_NOC_AGENT_IDS,
  nocWindowToSinceIso,
  type NocFilters,
} from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { Mono, PillBtn, SourceStatusBadge } from "./noc-primitives";

/** Phase 174 four-state semantic for the panel-level empty/error surface. */
type PanelSemantic = "live" | "window_empty" | "no_history" | "stale_or_error" | "loading";

const LOCAL_AGENT_IDS = new Set<string>(LOCAL_NOC_AGENT_IDS);

function workspaceMatches(owner: string, workspace: NocFilters["workspace"]): boolean {
  if (workspace === "all") return true;
  const isLocal = LOCAL_AGENT_IDS.has(owner.trim().toLowerCase());
  return workspace === "local" ? isLocal : !isLocal;
}

function latestSkillTimestamp(skill: {
  lastActivityAt: string | null;
  updatedAt: string | null;
  approvedAt: string | null;
}): number | null {
  for (const value of [skill.lastActivityAt, skill.updatedAt, skill.approvedAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function SkillsLifecycle({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const skills = useSkills();
  const seal = useSealProposals("pending");
  const sinceMs = Date.parse(nocWindowToSinceIso(effectiveFilters.window));
  const allDetails = skills.data?.skillDetails ?? [];
  const workspaceDetails = allDetails.filter((skill) =>
    workspaceMatches(skill.owner, effectiveFilters.workspace),
  );
  const details = workspaceDetails.filter((skill) => {
    const timestamp = latestSkillTimestamp(skill);
    return timestamp !== null && timestamp >= sinceMs;
  });
  const filteredSealProposals = (seal.data?.proposals ?? []).filter((proposal) => {
    const createdAt = Date.parse(proposal.createdAt);
    return (
      Number.isFinite(createdAt) &&
      createdAt >= sinceMs &&
      workspaceMatches(proposal.agentId, effectiveFilters.workspace)
    );
  });
  const columns = useMemo(() => {
    return [
      {
        stage: "Emerging",
        sub: "agent-limited skills and coverage gaps",
        color: NOC.info,
        items: details.filter((skill) => skill.stage === "agent-limited").slice(0, 3),
      },
      {
        stage: "Live",
        sub: "general skills approved for reuse",
        color: NOC.success,
        items: details.filter((skill) => skill.stage === "general").slice(0, 3),
      },
      {
        stage: "Drifting",
        sub: "coverage gaps or needs-source health",
        color: NOC.warn,
        items: details.filter((skill) => skill.health !== "ready").slice(0, 3),
      },
      {
        stage: "Enterprise",
        sub: "enterprise-ready or approved candidates",
        color: NOC.terra,
        items: details.filter((skill) => skill.stage === "enterprise" || skill.reviewStatus === "enterprise-ready").slice(0, 3),
      },
    ];
  }, [details]);
  const total = details.length;
  const promoted = details.filter((skill) => skill.approvedAt).length;
  const selectedNames = new Set(details.map((skill) => skill.name));
  const dormant = skills.data?.coverageGaps.filter((name) => selectedNames.has(name)).length ?? 0;
  const drifting = details.filter((skill) => skill.health !== "ready").length;
  const pendingSeal = filteredSealProposals.length;
  const sourceFailed = skills.isError || seal.isError;
  const sourceLoading = skills.isLoading || seal.isLoading;
  const panelStatus: MetricStatus = sourceFailed
    ? "error"
    : sourceLoading
      ? "blocked"
      : total > 0
        ? "live"
        : "zero";
  // The panel filters the cumulative registry snapshot client-side using
  // each skill's owner and latest activity timestamp. The wider probe uses
  // the same workspace before deciding window_empty versus no_history.
  const panelSemantic: PanelSemantic = sourceFailed
    ? "stale_or_error"
    : sourceLoading
      ? "loading"
      : details.length > 0
        ? "live"
        : workspaceDetails.length > 0 ||
            (effectiveFilters.workspace === "all" && skills.data?.lastUpdated != null)
          ? "window_empty"
          : "no_history";

  return (
    <div style={{ padding: "0 28px 14px" }}>
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}` }}>
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${NOC.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >

          <div style={{ fontWeight: 600, fontSize: 13, color: NOC.ink }}>Skills lifecycle</div>
          <span style={{ fontSize: 11.5, color: NOC.soft }}>
            {skills.isError
              ? "failed to load /api/skills"
              : skills.isLoading
                ? "loading /api/skills"
                : `${total} total · ${promoted} approved · ${dormant} coverage gaps · ${drifting} drifting`}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <SourceStatusBadge status={panelStatus} />
            <SourceStatusBadge status={panelSemantic === "live" ? "live" : panelSemantic === "window_empty" ? "empty" : panelSemantic === "stale_or_error" ? "error" : "empty"} label={panelSemantic} />
            <PillBtn href="/seal">SEAL proposals · {pendingSeal}</PillBtn>
            <PillBtn href="/skills" variant="solid">Promote candidate</PillBtn>
          </div>
        </div>
        <div
          data-status-block={panelSemantic}
          data-filters={`window=${effectiveFilters.window}&workspace=${effectiveFilters.workspace}`}
          style={{
            padding: "8px 16px 0",
            fontSize: 10.5,
            color: NOC.soft,
            fontFamily: NOC_FONT_MONO,
          }}
        >
          Scope: skill rows and pending SEAL proposals filtered by window={effectiveFilters.window}, workspace={effectiveFilters.workspace}. {workspaceDetails.length} skill record{workspaceDetails.length === 1 ? "" : "s"} exist in the widest same-workspace probe; registry last touched {skills.data?.lastUpdated ?? "—"}.
        </div>
        {sourceFailed ? (
          <div
            data-status-block="stale_or_error"
            style={{ color: NOC.warn, fontSize: 11.5, lineHeight: 1.5, padding: "14px 16px" }}
          >
            Skills lifecycle data is stale or unavailable; the registry or SEAL source may be down.
          </div>
        ) : sourceLoading ? (
          <div style={{ color: NOC.soft, fontSize: 11.5, padding: "14px 16px" }}>
            Loading skills lifecycle…
          </div>
        ) : (
        <div
          data-mobile-grid="skills-lifecycle"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          {columns.map((col, i) => (
            <div
              key={col.stage}
              style={{
                borderRight: i < 3 ? `1px solid ${NOC.rule}` : "none",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderBottom: `1px solid ${NOC.rule}`,
                }}
              >
                <span
                  style={{
                    width: 6, height: 6,
                    background: col.color,
                    borderRadius: 99,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12.5, fontWeight: 600, color: NOC.ink }}>
                  {col.stage}
                </div>
                <Mono color={NOC.soft} size={11}>{col.items.length}</Mono>
              </div>

              {/* Items */}
              <div style={{ minHeight: 200 }}>
                {col.items.length === 0 && (
                  <div data-status-block="no_history" style={{ padding: "10px 14px", fontSize: 12, color: NOC.soft }}>
                    {panelSemantic === "stale_or_error"
                      ? `${col.stage} stage data is stale or unavailable; the registry or SEAL source may be down.`
                      : panelSemantic === "window_empty"
                        ? `No ${col.stage.toLowerCase()} skill records in the loaded registry snapshot, but the registry has prior activity outside the selected window. Widen the window or check /skills for older entries.`
                        : `No ${col.stage.toLowerCase()} skill records yet. Registry installs and promotions populate this stage.`}
                  </div>
                )}
                {col.items.map((it, j) => (
                  <div
                    key={it.name}
                    style={{
                      padding: "10px 14px",
                      borderBottom:
                        j < col.items.length - 1
                          ? `1px solid ${NOC.rule}`
                          : "none",
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: NOC.ink, marginBottom: 3 }}>
                      {it.title || it.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: NOC.soft,
                        fontFamily: NOC_FONT_MONO,
                      }}
                    >
                      {it.reviewStatus} · {it.health}
                    </div>
                    {it.health !== "ready" && (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: NOC.terra,
                          marginTop: 3,
                        }}
                      >
                        {it.path}
                      </div>
                    )}
                  </div>
                ))}
                <div
                  style={{
                    padding: "8px 14px 12px",
                    fontSize: 11,
                    color: NOC.soft,
                  }}
                >
                  {col.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
