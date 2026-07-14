
"use client";

import { useMemo } from "react";

import { useSealProposals, useSkills } from "@/lib/api-client";
import { nocWindowLabel, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { Mono, PillBtn } from "./noc-primitives";

export function SkillsLifecycle({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };  const skills = useSkills();
  const seal = useSealProposals("pending");
  const columns = useMemo(() => {
    const details = skills.data?.skillDetails ?? [];
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
  }, [skills.data?.skillDetails]);
  const total = skills.data?.totalSkills ?? 0;
  const promoted = skills.data?.skillDetails.filter((skill) => skill.approvedAt).length ?? 0;
  const dormant = skills.data?.coverageGaps.length ?? 0;
  const drifting = skills.data?.skillDetails.filter((skill) => skill.health !== "ready").length ?? 0;
  const pendingSeal = seal.data?.proposals.length ?? 0;

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
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <PillBtn href="/seal">SEAL proposals · {pendingSeal}</PillBtn>
            <PillBtn href="/skills" variant="solid">Promote candidate</PillBtn>
          </div>
        </div>
        <div
          style={{
            padding: "8px 16px 0",
            fontSize: 10.5,
            color: NOC.soft,
            fontFamily: NOC_FONT_MONO,
          }}
        >
          Scope: cumulative skill registry snapshot — window={effectiveFilters.window}, workspace={effectiveFilters.workspace} filters do not partition this metric ({nocWindowLabel(effectiveFilters.window)} for context only).
        </div>
        {/* 4 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
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
                  <div style={{ padding: "10px 14px", fontSize: 12, color: NOC.soft }}>
                    No live records in this stage.
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
      </div>
    </div>
  );
}
