// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { buildAgentContextPacket } from "@/lib/agent-context-packet";
import { createAgentCheckpoint } from "@/lib/agent-checkpoints";
import { ensureAgentContextBusSchema, postAgentContextMessage } from "@/lib/agent-context-bus";
import { initSchema } from "@/lib/db-schema";
import { recordMemoryTrace } from "@/lib/memory-trace-observability";

const GOAL_ID = "phase-132-fixture";
const FIXED_NOW = new Date("2026-07-06T12:00:00.000Z");

function seedDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  ensureAgentContextBusSchema(db);
  const insertAgent = db.prepare(
    `INSERT INTO registered_agents(id, name, role, platform, protocol, status)
     VALUES(?, ?, ?, 'codex', 'rest', 'active')`
  );
  insertAgent.run("agent-alpha", "Agent Alpha", "Sender");
  insertAgent.run("agent-beta", "Agent Beta", "Recipient");
  return db;
}

describe("agent context packet", () => {
  it("assembles redacted packet and run ledger from existing substrates", () => {
    const db = seedDb();
    db.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, status, context_id)
       VALUES(?, 'codex', 'agent-beta', 'Build Phase 132 context packet', 'active', ?)`
    ).run(GOAL_ID, GOAL_ID);
    db.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES('codex', 'checkpoint', 'Phase 132 worker accepted', ?)`
    ).run(JSON.stringify({ goalId: GOAL_ID, path: ".planning/phases/132-agent-os-gsd-control-plane/132-01-PLAN.md" }));
    db.prepare(
      `INSERT INTO agent_session_captures(
         id, source_agent_id, runtime, session_id, task_id, capture_hash, captured_at, summary
       ) VALUES(
         'capture-132', 'agent-alpha', 'codex', 'session-132', ?, 'sha256:capture', '2026-07-06T11:00:00Z',
         'PRIVATE_CAPTURE_SECRET'
       )`
    ).run(GOAL_ID);
    db.prepare(
      `INSERT INTO agent_memory_candidates(
         id, capture_id, agent_id, memory_type, content, content_hash, status, metadata_json, belief_stage
       ) VALUES(
         'mem-denied', 'capture-132', 'agent-alpha', 'task_state', 'PRIVATE_CANDIDATE_SECRET',
         'sha256:candidate', 'candidate', ?, 'silver_candidate_claim'
       )`
    ).run(JSON.stringify({
      goalId: GOAL_ID,
      title: "PRIVATE_METADATA_TITLE_SECRET",
      summary: "PRIVATE_METADATA_SUMMARY_SECRET",
      authorization: "denied",
      provenance: ["PRIVATE_METADATA_PROVENANCE_SECRET"],
      caveat: "PRIVATE_METADATA_CAVEAT_SECRET",
    }));
    postAgentContextMessage(db, {
      fromAgent: "agent-alpha",
      toAgent: "agent-beta",
      threadId: GOAL_ID,
      body: "PRIVATE_MESSAGE_BODY_SECRET",
      subject: "Goal sync",
      artifacts: { path: "docs/context.md", hash: "sha256:docs" },
    });
    recordMemoryTrace(db, {
      runId: GOAL_ID,
      taskId: GOAL_ID,
      agentId: "agent-alpha",
      causalPath: {
        contextAssembly: "fixture",
        retrievalQuery: "phase 132",
        retrievedCandidates: [
          { id: "trace-private", content: "PRIVATE_TRACE_SECRET", score: 0.98 },
        ],
        policyFilters: [
          { id: "trace-private", decision: "deny", reason: "private source" },
        ],
        promptInclusion: false,
      },
    });
    createAgentCheckpoint(db, {
      runId: GOAL_ID,
      ownerAgentId: "agent-alpha",
      objective: "Build Phase 132 context packet",
      decisions: { substrate: "reuse existing proof tables" },
      artifactRefs: ["apps/memroos/src/lib/agent-context-packet.ts"],
      verificationState: { "focused tests": "pending" },
      nextSafeAction: "Run route test",
    });

    const result = buildAgentContextPacket(db, {
      goalId: GOAL_ID,
      actorAgentId: "agent-alpha",
      lane: "code",
      now: () => FIXED_NOW,
    });
    const serialized = JSON.stringify(result);

    expect(result.packet.goal).toMatchObject({
      id: GOAL_ID,
      title: "Build Phase 132 context packet",
      status: "active",
      lane: "code",
    });
    expect(result.packet.memories[0]).toMatchObject({
      id: "mem-denied",
      title: "task_state",
      authorization: "denied",
      whyIncluded: "candidate matched goal but content is denied; exposing receipt only",
    });
    expect(result.packet.memories[0]?.provenance).toEqual([
      "agent_memory_candidates:mem-denied",
      "content_hash:sha256:candidate",
    ]);
    expect(result.packet.receipts).toContainEqual(
      expect.objectContaining({
        source: "agent_memory_traces",
        status: "denied",
        reason: "private source",
      })
    );
    expect(result.ledger.tasks[0]).toMatchObject({ id: GOAL_ID, status: "active" });
    expect(result.ledger.verifications[0]).toMatchObject({ requiredProof: "focused tests", proofStatus: "pending" });
    expect(result.packet.packetHash).toMatch(/^sha256:/);

    expect(serialized).not.toContain("PRIVATE_CANDIDATE_SECRET");
    expect(serialized).not.toContain("PRIVATE_MESSAGE_BODY_SECRET");
    expect(serialized).not.toContain("PRIVATE_TRACE_SECRET");
    expect(serialized).not.toContain("PRIVATE_CAPTURE_SECRET");
    expect(serialized).not.toContain("PRIVATE_METADATA_TITLE_SECRET");
    expect(serialized).not.toContain("PRIVATE_METADATA_SUMMARY_SECRET");
    expect(serialized).not.toContain("PRIVATE_METADATA_PROVENANCE_SECRET");
    expect(serialized).not.toContain("PRIVATE_METADATA_CAVEAT_SECRET");
    db.close();
  });

  it("returns skipped receipts for a fresh goal instead of failing", () => {
    const db = seedDb();
    const result = buildAgentContextPacket(db, {
      goalId: "empty-goal",
      actorAgentId: "agent-alpha",
      now: () => FIXED_NOW,
    });

    expect(result.packet.goal.status).toBe("planned");
    expect(result.packet.receipts).toContainEqual(
      expect.objectContaining({
        source: "agent_memory_traces",
        status: "skipped",
      })
    );
    expect(result.ledger.tasks).toEqual([]);
    db.close();
  });
});
