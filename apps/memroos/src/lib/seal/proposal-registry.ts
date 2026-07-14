import type { ProposalType } from "./proposal-types";
import type { ProposalDraft } from "./types";
import type Database from "better-sqlite3";

export interface ProposalRegistryEntry {
  type: string;
  label: string;
  description: string;
  internal?: boolean;
  buildDraft(input: {
    traceId: string;
    runId: string;
    agentId: string;
    baselineW: number;
    baselineLayers: ProposalDraft["baselineLayers"];
  }): Omit<ProposalDraft, "proposalType">;
  applyShadow(diff: Record<string, unknown>, db?: Database.Database): Record<string, unknown>;
  rollbackShadow?(diff: Record<string, unknown>, applyResult: Record<string, unknown>, db?: Database.Database): void;
}

function resolveDb(db?: Database.Database): Database.Database {
  if (db) return db;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDb } = require("@/lib/db") as typeof import("@/lib/db");
  return getDb();
}

export const PROPOSAL_TYPES = {
  /**
   * @internal
   * Substrate-only proposal type used to exercise the closed registry,
   * approval queue, apply/eval/rollback loop, and audit path before real
   * mutation surfaces arrive in later phases.
   */
  noop_test: {
    type: "noop_test",
    label: "Substrate test",
    description: "No-op proposal used to validate the SEAL loop.",
    internal: true,
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "noop",
        before: null,
        after: null,
        note: "No resource mutation; validates SEAL infrastructure only.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below the reflection threshold; propose a no-op substrate check.`,
      forecastWDelta: 0,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, diff }),
  },

  /**
   * Rewrites the content of a stored memory entry to improve factual accuracy
   * or relevance. The diff carries the memory ID, the old content, and the
   * proposed new content. applyShadow records the intent; the actual backend
   * write is executed by an operator-confirmed job.
   */
  memory_rewrite: {
    type: "memory_rewrite",
    label: "Memory rewrite",
    description: "Rewrites a stored memory entry to improve factual accuracy or relevance.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "memory_rewrite",
        memoryId: null,
        before: null,
        after: null,
        tier: "vector",
        note: "Proposed memory rewrite to improve recall quality for this trace.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; a memory rewrite may improve recall fidelity.`,
      forecastWDelta: 0.05,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingWrite: true, diff }),
  },

  /**
   * Adds a retrieval hint (alternative phrasing, synonym expansion, or
   * embedding anchor) to improve recall of an existing memory entry.
   */
  query_hint: {
    type: "query_hint",
    label: "Query hint",
    description: "Adds a retrieval hint to improve recall of an existing memory entry.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "query_hint",
        memoryId: null,
        hint: null,
        hintType: "synonym",
        note: "Proposed retrieval hint to reduce recall miss rate.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; a query hint may close the recall gap.`,
      forecastWDelta: 0.03,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingWrite: true, diff }),
  },

  /**
   * Adjusts the salience or decay tier of a memory entry so that higher-value
   * memories are promoted and low-signal memories are demoted or expired sooner.
   */
  salience_update: {
    type: "salience_update",
    label: "Salience update",
    description: "Adjusts the salience/decay tier for a memory entry.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "salience_update",
        memoryId: null,
        currentSalience: null,
        proposedSalience: null,
        decayTier: "standard",
        note: "Proposed salience adjustment to improve retrieval ranking.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; a salience update may improve retrieval ranking.`,
      forecastWDelta: 0.02,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingWrite: true, diff }),
  },

  /**
   * Changes which memory tier (vector / graph / episodic) a memory entry is
   * routed to, enabling better retrieval based on the query pattern observed.
   */
  tier_route: {
    type: "tier_route",
    label: "Tier route change",
    description: "Changes which memory tier a memory entry is routed to.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "tier_route",
        memoryId: null,
        fromTier: null,
        toTier: null,
        note: "Proposed tier routing change to improve retrieval coverage.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; routing to a different memory tier may improve coverage.`,
      forecastWDelta: 0.04,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingWrite: true, diff }),
  },

  /**
   * Proposes a revision to an existing skill's SKILL.md artifact.
   * Shadow apply writes a new skill_registry row (is_active=1) and flips the
   * previous row (is_active=0) inside a SQLite transaction.
   * Requires skill_id to be embedded in diff so applyShadow can locate the target skill.
   * Phase 85: Foundation — stub applyShadow; full implementation in Phase 89.
   */
  skill_revision: {
    type: "skill_revision",
    label: "Skill revision",
    description: "Propose a revision to an existing skill's SKILL.md artifact.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "skill_revision",
        skillId: null,
        sourceVersion: null,
        proposedDiff: null,
        trainSplitId: null,
        validationResults: null,
        heldOutResults: null,
        wDelta: 0,
        rejectedEdits: [],
        residualRisks: [],
        note: "Proposed skill revision based on failure pattern analysis.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; a skill revision may improve trigger matching and contract completeness.`,
      forecastWDelta: 0.05,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff, dbHandle) => {
      const db = resolveDb(dbHandle);
      const skillId = diff["skillId"] as string | undefined;
      const proposedDiff = diff["proposedDiff"] as string | null | undefined;
      if (!skillId) return { applied: false, reason: "Missing skillId in diff" };

      // Phase 85: stub — write to skillforge_proposals instead of skill_registry
      const info = db.prepare(
        "INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status)" +
        " VALUES (?, ?, ?, ?, 'applied')"
      ).run(
        `sf-${Date.now()}`,
        skillId,
        (diff["sourceVersion"] as string) ?? "1.0.0",
        proposedDiff ?? ""
      );

      return {
        applied: true,
        skillId,
        staged: true,
        insertedId: Number(info.lastInsertRowid),
      };
    },
    rollbackShadow: (_diff, applyResult, dbHandle) => {
      const insertedId = applyResult["insertedId"] as number | undefined;
      if (!insertedId) return;
      resolveDb(dbHandle).prepare("DELETE FROM skillforge_proposals WHERE id = ?").run(insertedId);
    },
  },

  /**
   * Proposes an edit to the agent's system prompt / operating instructions.
   * Shadow apply writes a new agent_instructions row (is_active=1) and flips the
   * previous row (is_active=0) inside a SQLite transaction.
   * Requires agent_id to be embedded in diff so applyShadow can locate the target agent.
   */
  agent_instruction_patch: {
    type: "agent_instruction_patch",
    label: "Agent instruction patch",
    description: "Propose an edit to the agent's system prompt or operating instructions.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "agent_instruction_patch",
        agentId,
        before: null,
        after: null,
        note: "Proposed instruction patch to improve agent response quality.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; an instruction patch may improve agent output quality.`,
      forecastWDelta: 0.06,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff, dbHandle) => {
      const db = resolveDb(dbHandle);
      const agentId = diff["agentId"] as string | undefined;
      const after = diff["after"] as string | null | undefined;
      if (!agentId) return { applied: false, reason: "Missing agentId in diff" };

      const previousRows = db
        .prepare("SELECT id FROM agent_instructions WHERE agent_id = ? AND is_active = 1")
        .all(agentId) as Array<{ id: number }>;

      // Deactivate previous active instruction rows for this agent
      db.prepare("UPDATE agent_instructions SET is_active = 0 WHERE agent_id = ? AND is_active = 1").run(agentId);

      // Find the max existing version
      const versionRow = db
        .prepare("SELECT MAX(version) AS max_v FROM agent_instructions WHERE agent_id = ?")
        .get(agentId) as { max_v: number | null } | undefined;
      const nextVersion = (versionRow?.max_v ?? 0) + 1;

      const info = db.prepare(
        "INSERT INTO agent_instructions (agent_id, instructions_text, version, is_active)" +
        " VALUES (?, ?, ?, 1)"
      ).run(agentId, after ?? "", nextVersion);

      return {
        applied: true,
        agentId,
        version: nextVersion,
        insertedId: Number(info.lastInsertRowid),
        previousActiveIds: previousRows.map((row) => row.id),
      };
    },
    rollbackShadow: (_diff, applyResult, dbHandle) => {
      const db = resolveDb(dbHandle);
      const insertedId = applyResult["insertedId"] as number | undefined;
      const previousActiveIds = applyResult["previousActiveIds"] as number[] | undefined;
      if (insertedId) db.prepare("DELETE FROM agent_instructions WHERE id = ?").run(insertedId);
      for (const id of previousActiveIds ?? []) {
        db.prepare("UPDATE agent_instructions SET is_active = 1 WHERE id = ?").run(id);
      }
    },
  },

  /**
   * Proposes registering a new skill entry for the agent when observed gaps repeat.
   * v1: mutation target is a DB record in proposed_skills (no file-system write).
   * // v2: file-system scaffold — write skill module to src/lib/skills/_proposed/<skill-id>/index.ts,
   * //     rerun evals with env flag, mv to canonical path on keep. See Phase 60 CONTEXT Decision 6.
   */
  skill_addition: {
    type: "skill_addition",
    label: "Skill addition",
    description: "Propose registering a new skill for the agent when observed gaps repeat.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "skill_addition",
        agentId,
        skillId: `auto-skill-${traceId}`,
        action: "add",
        metadata: {
          name: null,
          description: null,
          tags: ["auto-generated"],
        },
        note: "Proposed skill addition to fill an observed capability gap.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; a new skill may close the observed capability gap.`,
      forecastWDelta: 0.07,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff, dbHandle) => {
      const db = resolveDb(dbHandle);
      const agentId = diff["agentId"] as string | undefined;
      const skillId = diff["skillId"] as string | undefined;
      const action = diff["action"] as string | undefined;
      const metadata = diff["metadata"] as Record<string, unknown> | undefined;

      if (!agentId || !skillId) return { applied: false, reason: "Missing agentId or skillId in diff" };

      const info = db.prepare(
        "INSERT INTO proposed_skills (agent_id, skill_id, action, metadata, status)" +
        " VALUES (?, ?, ?, ?, 'proposed')"
      ).run(agentId, skillId, action ?? "add", JSON.stringify(metadata ?? {}));

      return { applied: true, agentId, skillId, staged: true, insertedId: Number(info.lastInsertRowid) };
    },
    rollbackShadow: (_diff, applyResult, dbHandle) => {
      const insertedId = applyResult["insertedId"] as number | undefined;
      if (!insertedId) return;
      resolveDb(dbHandle).prepare("DELETE FROM proposed_skills WHERE id = ?").run(insertedId);
    },
  },

  /**
   * Proposes a change to the agent's tool preference weight for a given context pattern.
   * Shadow apply writes a new agent_tool_routing_policies row and flips the old row's
   * is_active to 0 inside the service.ts transaction.
   */
  tool_routing_update: {
    type: "tool_routing_update",
    label: "Tool routing update",
    description: "Propose a change to the agent's tool preference weight for a given context pattern.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "tool_routing_update",
        agentId,
        toolName: null,
        contextPattern: "*",
        oldWeight: 1.0,
        newWeight: null,
        note: "Proposed tool routing weight change to improve tool selection accuracy.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; adjusting tool routing preference may improve task completion.`,
      forecastWDelta: 0.04,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff, dbHandle) => {
      const db = resolveDb(dbHandle);
      const agentId = diff["agentId"] as string | undefined;
      const toolName = diff["toolName"] as string | null | undefined;
      const contextPattern = (diff["contextPattern"] as string | undefined) ?? "*";
      const newWeight = diff["newWeight"] as number | null | undefined;

      if (!agentId) return { applied: false, reason: "Missing agentId in diff" };

      const resolvedToolName = toolName ?? "unknown";
      const previousRows = db
        .prepare("SELECT id FROM agent_tool_routing_policies WHERE agent_id = ? AND tool_name = ? AND is_active = 1")
        .all(agentId, resolvedToolName) as Array<{ id: number }>;

      // Deactivate previous active policy for this agent+tool combination
      if (toolName) {
        db.prepare(
          "UPDATE agent_tool_routing_policies SET is_active = 0" +
          " WHERE agent_id = ? AND tool_name = ? AND is_active = 1"
        ).run(agentId, toolName);
      }

      const info = db.prepare(
        "INSERT INTO agent_tool_routing_policies (agent_id, tool_name, context_pattern, preference_weight, is_active)" +
        " VALUES (?, ?, ?, ?, 1)"
      ).run(agentId, resolvedToolName, contextPattern, newWeight ?? 1.0);

      return {
        applied: true,
        agentId,
        toolName: resolvedToolName,
        contextPattern,
        newWeight,
        insertedId: Number(info.lastInsertRowid),
        previousActiveIds: previousRows.map((row) => row.id),
      };
    },
    rollbackShadow: (_diff, applyResult, dbHandle) => {
      const db = resolveDb(dbHandle);
      const insertedId = applyResult["insertedId"] as number | undefined;
      const previousActiveIds = applyResult["previousActiveIds"] as number[] | undefined;
      if (insertedId) db.prepare("DELETE FROM agent_tool_routing_policies WHERE id = ?").run(insertedId);
      for (const id of previousActiveIds ?? []) {
        db.prepare("UPDATE agent_tool_routing_policies SET is_active = 1 WHERE id = ?").run(id);
      }
    },
  },

  ontology_promotion: {
    type: "ontology_promotion",
    label: "Ontology promotion",
    description: "Promotes an approved ontology candidate only after complete evidence and governed review.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "ontology_promotion",
        candidateId: null,
        ontologyId: null,
        ontologyVersion: null,
        ontologyContentHash: null,
        namespace: null,
        policyContextHash: null,
        expiry: null,
        note: "A candidate remains non-authoritative until an operator-approved SEAL promotion.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} identified a governed ontology candidate for operator review.`,
      forecastWDelta: 0,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingGovernedCommit: true, diff }),
  },

  /**
   * Adds a new example to the golden set when a memory miss is observed.
   * After operator approval the example is appended to the golden set file
   * and used in subsequent eval runs.
   */
  eval_case_addition: {
    type: "eval_case_addition",
    label: "Eval case addition",
    description: "Adds a new example to the golden set when a memory miss is observed.",
    buildDraft: ({ traceId, runId, agentId, baselineW, baselineLayers }) => ({
      traceId,
      runId,
      agentId,
      diff: {
        kind: "eval_case_addition",
        goldenSetPath: null,
        newExample: {
          id: `auto-${traceId}`,
          role: "memory-recall",
          input: null,
          expectedOutput: null,
          humanScore: 0.5,
          tags: ["auto-generated", "memory-miss"],
        },
        note: "Auto-generated golden set example from observed memory miss.",
      },
      rationale: `Composite W ${baselineW.toFixed(3)} is below threshold; this trace represents a memory miss worth capturing as a golden example.`,
      forecastWDelta: 0.01,
      baselineW,
      baselineRunId: runId,
      baselineLayers,
    }),
    applyShadow: (diff) => ({ applied: true, pendingWrite: true, diff }),
  },
} as const satisfies Record<string, ProposalRegistryEntry>;

// v2+ extension path:
// Runtime plugin registration is intentionally not implemented in Phase 58.
// New proposal surfaces must be added by editing this closed registry, adding a
// concrete ProposalType key, and providing tests for reflection, shadow apply,
// rollback, and audit deltas. A future plugin model can replace this const with
// signed manifest loading once proposal capability boundaries and review policy
// are defined.

export function ensureProposalType(value: string): ProposalType {
  if (value in PROPOSAL_TYPES) return value as ProposalType;
  throw new Error(`Unknown SEAL proposal type: ${value}`);
}

export function registryEntryFor(value: string): ProposalRegistryEntry {
  return PROPOSAL_TYPES[ensureProposalType(value)];
}
