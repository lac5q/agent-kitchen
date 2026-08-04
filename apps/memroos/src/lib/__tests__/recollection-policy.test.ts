import { describe, expect, it } from "vitest";

import {
  assembleRecollectionContextPack,
  decideRecollection,
  planRecollectionQueries,
  scoreRecollectionCandidate,
  type RecollectionCandidate,
} from "../memory/recollection";

const NOW = new Date("2026-06-27T12:00:00Z");

describe("recollection policy trigger decisions", () => {
  it("requires search for recent project handoff tasks and emits bounded tier-aware queries", () => {
    const decision = decideRecollection({
      taskText: "Before drafting the Cordant follow-up, check yesterday's Sagi handoff and latest meeting notes.",
      timing: "before_plan",
      project: "cordant",
      entities: ["Sagi"],
      handoffState: "active",
      now: NOW,
    });

    expect(decision).toMatchObject({
      decision: "search_required",
      timing: "before_plan",
      skipReason: null,
    });
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        "task_has_recency_ref",
        "task_has_project_ref",
        "project_has_recent_handoff",
        "task_has_stable_entities",
      ])
    );
    expect(decision.queries.length).toBeGreaterThan(0);
    expect(decision.queries[0]).toMatchObject({
      scope: { project: "cordant" },
      limit: 8,
    });
    expect(decision.queries[0].tiers).toEqual(expect.arrayContaining(["episodic", "vector", "qmd", "graph"]));
    expect(decision.queries[0].text).toContain("Cordant");
  });

  it("records an explicit skipped-search receipt for local mechanical tasks", () => {
    const decision = decideRecollection({
      taskText: "Format this JSON alphabetically.",
      timing: "before_tool_use",
      now: NOW,
    });

    expect(decision).toEqual({
      decision: "search_skipped",
      timing: "before_tool_use",
      reasons: ["low_memory_need", "no_stable_entities"],
      queries: [],
      skipReason: "Task is local or mechanical with no stable recall dependency.",
    });
  });

  it("caps planned query limits and preserves explicit project/source scope", () => {
    const queries = planRecollectionQueries({
      taskText: "Find latest MemRoOS Phase 118 notes in the roadmap docs.",
      timing: "before_plan",
      project: "memroos",
      sourceRefs: ["roadmap", "docs"],
      requestedLimit: 50,
      now: NOW,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      limit: 8,
      scope: { project: "memroos", sources: ["roadmap", "docs"] },
    });
    expect(queries[0].tiers).toEqual(expect.arrayContaining(["episodic", "vector", "qmd"]));
  });
});

describe("recollection candidate scoring and context packing", () => {
  const oldCritical: RecollectionCandidate = {
    id: "critical-impact-rule",
    tier: "qmd",
    content: "Critical rule: before editing any function, run GitNexus impact analysis and report blast radius.",
    beliefStage: "gold_operational_truth",
    capturedAt: "2025-01-01T00:00:00Z",
    importance: 1,
    sourceHealth: "ok",
    priorUsefulness: 0.9,
    authorization: "allowed",
    policyRisk: "low",
    provenance: "AGENTS.md",
  };

  const recentNoise: RecollectionCandidate = {
    id: "recent-low-value",
    tier: "episodic",
    content: "Recent note: the UI panel background was adjusted.",
    beliefStage: "gold_operational_truth",
    capturedAt: "2026-06-27T11:55:00Z",
    importance: 0.05,
    sourceHealth: "ok",
    priorUsefulness: 0,
    authorization: "allowed",
    policyRisk: "low",
    provenance: "memory",
  };

  it("lets older critical rules outrank recent low-value context when relevance and importance demand it", () => {
    const taskText = "Before editing recordMemoryTrace, what impact analysis rule applies?";
    const criticalScore = scoreRecollectionCandidate(oldCritical, { taskText, now: NOW });
    const noiseScore = scoreRecollectionCandidate(recentNoise, { taskText, now: NOW });

    expect(criticalScore.total).toBeGreaterThan(noiseScore.total);
    expect(criticalScore.components.importance).toBe(1);
    expect(noiseScore.components.recency).toBeGreaterThan(criticalScore.components.recency);
  });

  it("demotes stale sources and excludes policy-denied candidates from injected context", () => {
    const staleAllowed: RecollectionCandidate = {
      ...oldCritical,
      id: "stale-critical",
      sourceHealth: "stale",
      provenance: "stale-source",
    };
    const denied: RecollectionCandidate = {
      ...oldCritical,
      id: "denied-critical",
      authorization: "denied",
      provenance: "sensitive-source",
    };

    const pack = assembleRecollectionContextPack([staleAllowed, denied], {
      taskText: "What impact analysis rule applies before editing?",
      now: NOW,
      threshold: 0.2,
    });

    expect(pack.injected.map((item) => item.id)).toContain("stale-critical");
    expect(pack.injected.map((item) => item.id)).not.toContain("denied-critical");
    expect(pack.ignored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "denied-critical", reason: "policy_denied" }),
      ])
    );
    const staleScore = scoreRecollectionCandidate(staleAllowed, {
      taskText: "What impact analysis rule applies before editing?",
      now: NOW,
    });
    expect(staleScore.components.freshness).toBeLessThan(1);
  });

  it("injects silver and bronze candidates only with caveats, never as gold operational truth", () => {
    const silver: RecollectionCandidate = {
      id: "silver-candidate",
      tier: "vector",
      content: "Candidate claim: Phase 118 should add proactive recollection receipts.",
      beliefStage: "silver_candidate_claim",
      capturedAt: "2026-06-27T10:00:00Z",
      importance: 0.8,
      sourceHealth: "ok",
      priorUsefulness: 0.3,
      authorization: "allowed",
      policyRisk: "low",
      provenance: "agent_memory_candidates",
    };
    const bronze: RecollectionCandidate = {
      id: "bronze-source",
      tier: "episodic",
      content: "Raw transcript excerpt mentioning proactive recollection receipts.",
      beliefStage: "bronze_raw_source",
      capturedAt: "2026-06-27T10:10:00Z",
      importance: 0.7,
      sourceHealth: "ok",
      priorUsefulness: 0.2,
      authorization: "allowed",
      policyRisk: "low",
      provenance: "transcript",
    };

    const pack = assembleRecollectionContextPack([silver, bronze], {
      taskText: "Plan proactive recollection receipts",
      now: NOW,
      threshold: 0.1,
    });

    expect(pack.injected).toHaveLength(2);
    expect(pack.injected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "silver-candidate",
          beliefStage: "silver_candidate_claim",
          reliance: "caveated_claim",
          caveatReason: expect.stringContaining("candidate"),
        }),
        expect.objectContaining({
          id: "bronze-source",
          beliefStage: "bronze_raw_source",
          reliance: "source_evidence_only",
          caveatReason: expect.stringContaining("raw source"),
        }),
      ])
    );
    expect(pack.injected.every((item) => item.reliance !== "direct_truth" || item.beliefStage === "gold_operational_truth")).toBe(true);
  });
});
