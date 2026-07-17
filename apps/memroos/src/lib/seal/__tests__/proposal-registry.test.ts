// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import type { EvalRunResult } from "@/lib/evals/types";
import {
  PROPOSAL_TYPES,
  ensureProposalType,
  registryEntryFor,
} from "../proposal-registry";

let testDb: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

function baselineLayers(): EvalRunResult["layers"] {
  return {
    l1: { score: 0.4, weight: 0.25, scorers: [] },
    l2: { score: 0.42, weight: 0.5, scorers: [] },
    l3: { score: 0.45, weight: 0.25, scorers: [] },
  };
}

function draftInput(overrides: Partial<{
  traceId: string;
  runId: string;
  agentId: string;
  baselineW: number;
}> = {}) {
  return {
    traceId: "trace-1",
    runId: "run-1",
    agentId: "agent-1",
    baselineW: 0.42,
    baselineLayers: baselineLayers(),
    ...overrides,
  };
}

function seedAgent(agentId = "agent-1"): void {
  testDb.prepare(
    "INSERT INTO registered_agents (id, name, role, platform, protocol, status, last_heartbeat_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(agentId, "Agent One", "ops", "codex", "local", "active", new Date().toISOString());
}

beforeEach(() => {
  testDb = new Database(":memory:");
  initSchema(testDb);
  seedAgent("agent-1");
});

afterEach(() => {
  testDb.close();
});

describe("ensureProposalType and registryEntryFor", () => {
  it("accepts every closed registry key", () => {
    for (const type of Object.keys(PROPOSAL_TYPES)) {
      expect(ensureProposalType(type)).toBe(type);
      expect(registryEntryFor(type).type).toBe(type);
    }
  });

  it("rejects unknown proposal types", () => {
    expect(() => ensureProposalType("not_registered")).toThrow(/Unknown SEAL proposal type/);
  });
});

describe("PROPOSAL_TYPES buildDraft", () => {
  it("builds drafts for every registry entry with trace metadata", () => {
    for (const entry of Object.values(PROPOSAL_TYPES)) {
      const draft = entry.buildDraft(draftInput());
      expect(draft.traceId).toBe("trace-1");
      expect(draft.runId).toBe("run-1");
      expect(draft.agentId).toBe("agent-1");
      expect(draft.baselineW).toBe(0.42);
      expect(draft.baselineRunId).toBe("run-1");
      expect(draft.baselineLayers).toEqual(baselineLayers());
      expect(draft.diff).toBeTruthy();
      expect(draft.rationale).toMatch(/0\.420/);
      expect(typeof draft.forecastWDelta).toBe("number");
    }
  });

  it("includes proposal-specific diff shapes", () => {
    expect(PROPOSAL_TYPES.noop_test.buildDraft(draftInput()).diff.kind).toBe("noop");
    expect(PROPOSAL_TYPES.memory_rewrite.buildDraft(draftInput()).diff.kind).toBe("memory_rewrite");
    expect(PROPOSAL_TYPES.skill_addition.buildDraft(draftInput()).diff.skillId).toBe("auto-skill-trace-1");
    expect(PROPOSAL_TYPES.agent_instruction_patch.buildDraft(draftInput()).diff.agentId).toBe("agent-1");
    expect(PROPOSAL_TYPES.ontology_promotion.buildDraft(draftInput()).forecastWDelta).toBe(0);
  });
});

describe("PROPOSAL_TYPES applyShadow (pending-write stubs)", () => {
  const pendingWriteTypes = [
    "memory_rewrite",
    "query_hint",
    "salience_update",
    "tier_route",
    "eval_case_addition",
  ] as const;

  it.each(pendingWriteTypes)("marks %s as pending write", (type) => {
    const diff = { kind: type };
    const result = PROPOSAL_TYPES[type].applyShadow(diff);
    expect(result).toEqual({ applied: true, pendingWrite: true, diff });
  });

  it("applies noop_test without pending write", () => {
    const diff = { kind: "noop" };
    expect(PROPOSAL_TYPES.noop_test.applyShadow(diff)).toEqual({ applied: true, diff });
  });

  it("applies ontology_promotion as governed commit", () => {
    const diff = { kind: "ontology_promotion" };
    expect(PROPOSAL_TYPES.ontology_promotion.applyShadow(diff)).toEqual({
      applied: true,
      pendingGovernedCommit: true,
      diff,
    });
  });
});

describe("skill_revision applyShadow and rollbackShadow", () => {
  it("rejects apply when skillId is missing", () => {
    const result = PROPOSAL_TYPES.skill_revision.applyShadow({ kind: "skill_revision" }, testDb);
    expect(result).toEqual({ applied: false, reason: "Missing skillId in diff" });
  });

  it("stages a skillforge proposal and rolls it back", () => {
    const diff = {
      kind: "skill_revision",
      skillId: "skill-abc",
      sourceVersion: "2.1.0",
      proposedDiff: "--- old\n+++ new",
    };

    const applied = PROPOSAL_TYPES.skill_revision.applyShadow(diff, testDb);
    expect(applied).toMatchObject({
      applied: true,
      skillId: "skill-abc",
      staged: true,
    });

    const row = testDb
      .prepare("SELECT source_skill_id, source_version, proposed_diff, status FROM skillforge_proposals LIMIT 1")
      .get() as {
      source_skill_id: string;
      source_version: string;
      proposed_diff: string;
      status: string;
    };
    expect(row.source_skill_id).toBe("skill-abc");
    expect(row.source_version).toBe("2.1.0");
    expect(row.proposed_diff).toBe("--- old\n+++ new");
    expect(row.status).toBe("applied");

    const storedId = (
      testDb.prepare("SELECT id FROM skillforge_proposals WHERE source_skill_id = ?").get("skill-abc") as { id: string }
    ).id;
    PROPOSAL_TYPES.skill_revision.rollbackShadow?.(diff, { insertedId: storedId as unknown as number }, testDb);
    const remaining = testDb.prepare("SELECT COUNT(*) AS cnt FROM skillforge_proposals").get() as { cnt: number };
    expect(remaining.cnt).toBe(0);
  });

  it("uses default sourceVersion and empty proposedDiff when omitted", () => {
    const diff = { kind: "skill_revision", skillId: "skill-defaults" };
    const applied = PROPOSAL_TYPES.skill_revision.applyShadow(diff, testDb);
    expect(applied).toMatchObject({ applied: true, skillId: "skill-defaults" });

    const row = testDb
      .prepare("SELECT source_version, proposed_diff FROM skillforge_proposals WHERE source_skill_id = ?")
      .get("skill-defaults") as { source_version: string; proposed_diff: string };
    expect(row.source_version).toBe("1.0.0");
    expect(row.proposed_diff).toBe("");
  });

  it("no-ops rollback when insertedId is missing", () => {
    testDb.prepare(
      "INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status) VALUES (?, ?, ?, ?, 'applied')"
    ).run("sf-keep", "skill-keep", "1.0.0", "");

    PROPOSAL_TYPES.skill_revision.rollbackShadow?.({}, {}, testDb);

    const row = testDb.prepare("SELECT id FROM skillforge_proposals WHERE id = ?").get("sf-keep");
    expect(row).toBeTruthy();
  });
});

describe("agent_instruction_patch applyShadow and rollbackShadow", () => {
  it("rejects apply when agentId is missing", () => {
    const result = PROPOSAL_TYPES.agent_instruction_patch.applyShadow({ kind: "agent_instruction_patch" }, testDb);
    expect(result).toEqual({ applied: false, reason: "Missing agentId in diff" });
  });

  it("deactivates prior instructions, increments version, and rolls back", () => {
    testDb.prepare(
      "INSERT INTO agent_instructions (agent_id, instructions_text, version, is_active) VALUES (?, ?, ?, 1)"
    ).run("agent-1", "v1 text", 1);
    const previous = testDb
      .prepare("SELECT id FROM agent_instructions WHERE agent_id = ? AND is_active = 1")
      .all("agent-1") as Array<{ id: number }>;

    const diff = { kind: "agent_instruction_patch", agentId: "agent-1", after: "v2 text" };
    const applied = PROPOSAL_TYPES.agent_instruction_patch.applyShadow(diff, testDb);

    expect(applied).toMatchObject({
      applied: true,
      agentId: "agent-1",
      version: 2,
      previousActiveIds: previous.map((row) => row.id),
    });

    const rows = testDb
      .prepare("SELECT instructions_text, version, is_active FROM agent_instructions WHERE agent_id = ? ORDER BY version")
      .all("agent-1") as Array<{ instructions_text: string; version: number; is_active: number }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ instructions_text: "v1 text", version: 1, is_active: 0 });
    expect(rows[1]).toMatchObject({ instructions_text: "v2 text", version: 2, is_active: 1 });

    PROPOSAL_TYPES.agent_instruction_patch.rollbackShadow?.(diff, applied, testDb);

    const afterRollback = testDb
      .prepare("SELECT version, is_active FROM agent_instructions WHERE agent_id = ? ORDER BY version")
      .all("agent-1") as Array<{ version: number; is_active: number }>;
    expect(afterRollback).toHaveLength(1);
    expect(afterRollback[0]).toEqual({ version: 1, is_active: 1 });
  });

  it("starts at version 1 for agents without prior instructions", () => {
    seedAgent("agent-new");
    const diff = { kind: "agent_instruction_patch", agentId: "agent-new" };
    const applied = PROPOSAL_TYPES.agent_instruction_patch.applyShadow(diff, testDb);
    expect(applied).toMatchObject({ applied: true, version: 1 });

    const row = testDb
      .prepare("SELECT instructions_text, version FROM agent_instructions WHERE agent_id = ?")
      .get("agent-new") as { instructions_text: string; version: number };
    expect(row.instructions_text).toBe("");
    expect(row.version).toBe(1);
  });
});

describe("skill_addition applyShadow and rollbackShadow", () => {
  it("rejects apply when agentId or skillId is missing", () => {
    expect(PROPOSAL_TYPES.skill_addition.applyShadow({ agentId: "agent-1" }, testDb)).toEqual({
      applied: false,
      reason: "Missing agentId or skillId in diff",
    });
    expect(PROPOSAL_TYPES.skill_addition.applyShadow({ skillId: "skill-1" }, testDb)).toEqual({
      applied: false,
      reason: "Missing agentId or skillId in diff",
    });
  });

  it("inserts proposed skill metadata and rolls back", () => {
    const diff = {
      agentId: "agent-1",
      skillId: "new-skill",
      action: "add",
      metadata: { name: "Recall helper", tags: ["auto"] },
    };
    const applied = PROPOSAL_TYPES.skill_addition.applyShadow(diff, testDb);
    expect(applied).toMatchObject({ applied: true, agentId: "agent-1", skillId: "new-skill", staged: true });

    const row = testDb
      .prepare("SELECT action, metadata, status FROM proposed_skills WHERE skill_id = ?")
      .get("new-skill") as { action: string; metadata: string; status: string };
    expect(row.action).toBe("add");
    expect(JSON.parse(row.metadata)).toEqual({ name: "Recall helper", tags: ["auto"] });
    expect(row.status).toBe("proposed");

    PROPOSAL_TYPES.skill_addition.rollbackShadow?.(diff, applied, testDb);
    const remaining = testDb.prepare("SELECT COUNT(*) AS cnt FROM proposed_skills").get() as { cnt: number };
    expect(remaining.cnt).toBe(0);
  });

  it("defaults action and metadata when omitted", () => {
    const diff = { agentId: "agent-1", skillId: "defaulted-skill" };
    PROPOSAL_TYPES.skill_addition.applyShadow(diff, testDb);
    const row = testDb
      .prepare("SELECT action, metadata FROM proposed_skills WHERE skill_id = ?")
      .get("defaulted-skill") as { action: string; metadata: string };
    expect(row.action).toBe("add");
    expect(JSON.parse(row.metadata)).toEqual({});
  });
});

describe("tool_routing_update applyShadow and rollbackShadow", () => {
  it("rejects apply when agentId is missing", () => {
    const result = PROPOSAL_TYPES.tool_routing_update.applyShadow({ toolName: "search" }, testDb);
    expect(result).toEqual({ applied: false, reason: "Missing agentId in diff" });
  });

  it("inserts policy with unknown tool when toolName is null", () => {
    const diff = { agentId: "agent-1", contextPattern: "ops/*", newWeight: 0.75 };
    const applied = PROPOSAL_TYPES.tool_routing_update.applyShadow(diff, testDb);
    expect(applied).toMatchObject({
      applied: true,
      toolName: "unknown",
      contextPattern: "ops/*",
      newWeight: 0.75,
    });

    const row = testDb
      .prepare("SELECT tool_name, context_pattern, preference_weight FROM agent_tool_routing_policies")
      .get() as { tool_name: string; context_pattern: string; preference_weight: number };
    expect(row.tool_name).toBe("unknown");
    expect(row.context_pattern).toBe("ops/*");
    expect(row.preference_weight).toBe(0.75);
  });

  it("deactivates prior policy, inserts new row, and rolls back", () => {
    testDb.prepare(
      "INSERT INTO agent_tool_routing_policies (agent_id, tool_name, context_pattern, preference_weight, is_active)" +
        " VALUES (?, ?, ?, ?, 1)"
    ).run("agent-1", "memory.search", "*", 1.0);
    const previous = testDb
      .prepare("SELECT id FROM agent_tool_routing_policies WHERE agent_id = ? AND tool_name = ? AND is_active = 1")
      .all("agent-1", "memory.search") as Array<{ id: number }>;

    const diff = {
      agentId: "agent-1",
      toolName: "memory.search",
      contextPattern: "trace/*",
      newWeight: 1.5,
    };
    const applied = PROPOSAL_TYPES.tool_routing_update.applyShadow(diff, testDb);
    expect(applied).toMatchObject({
      applied: true,
      toolName: "memory.search",
      previousActiveIds: previous.map((row) => row.id),
    });

    const rows = testDb
      .prepare(
        "SELECT preference_weight, is_active FROM agent_tool_routing_policies WHERE agent_id = ? AND tool_name = ? ORDER BY id"
      )
      .all("agent-1", "memory.search") as Array<{ preference_weight: number; is_active: number }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ preference_weight: 1.0, is_active: 0 });
    expect(rows[1]).toEqual({ preference_weight: 1.5, is_active: 1 });

    PROPOSAL_TYPES.tool_routing_update.rollbackShadow?.(diff, applied, testDb);
    const afterRollback = testDb
      .prepare(
        "SELECT preference_weight, is_active FROM agent_tool_routing_policies WHERE agent_id = ? AND tool_name = ? ORDER BY id"
      )
      .all("agent-1", "memory.search") as Array<{ preference_weight: number; is_active: number }>;
    expect(afterRollback).toHaveLength(1);
    expect(afterRollback[0]).toEqual({ preference_weight: 1.0, is_active: 1 });
  });

  it("defaults context pattern and weight when omitted", () => {
    const diff = { agentId: "agent-1", toolName: "calendar.read" };
    PROPOSAL_TYPES.tool_routing_update.applyShadow(diff, testDb);
    const row = testDb
      .prepare("SELECT context_pattern, preference_weight FROM agent_tool_routing_policies WHERE tool_name = ?")
      .get("calendar.read") as { context_pattern: string; preference_weight: number };
    expect(row.context_pattern).toBe("*");
    expect(row.preference_weight).toBe(1.0);
  });
});
