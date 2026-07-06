// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  buildGsdResume,
  buildGsdStandup,
  createOrResumeGsdGoal,
  runGsdShipcheck,
} from "@/lib/agent-gsd-control";
import { initSchema } from "@/lib/db-schema";

function seedDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  db.prepare(
    `INSERT INTO registered_agents(id, name, role, platform, protocol, status)
     VALUES('agent-alpha', 'Agent Alpha', 'Worker', 'codex', 'rest', 'active')`
  ).run();
  return db;
}

describe("agent GSD control plane", () => {
  it("creates a durable goal backed by the packet and ledger", () => {
    const db = seedDb();

    const result = createOrResumeGsdGoal(db, {
      goalId: "goal-phase-133",
      title: "Build shipcheck command",
      actorAgentId: "agent-alpha",
      lane: "code",
      acceptanceCriteria: ["focused_tests"],
    });

    expect(result.goalId).toBe("goal-phase-133");
    expect(result.packet.goal).toMatchObject({
      id: "goal-phase-133",
      title: "Build shipcheck command",
      status: "active",
      lane: "code",
    });
    expect(result.packet.constraints.requiredVerification).toContain("focused_tests");
    expect(result.ledger.tasks[0]).toMatchObject({ id: "goal-phase-133", status: "active" });
    expect(result.checkpointId).toMatch(/[0-9a-f-]{36}/);

    const delegation = db
      .prepare("SELECT task_summary, status, checkpoint FROM hive_delegations WHERE task_id = ?")
      .get("goal-phase-133") as { task_summary: string; status: string; checkpoint: string };
    expect(delegation.task_summary).toBe("Build shipcheck command");
    expect(delegation.status).toBe("active");
    expect(JSON.parse(delegation.checkpoint).resumeFrom).toBe("shipcheck");
    db.close();
  });

  it("blocks shipcheck until lane proof exists, then logs verified proof", () => {
    const db = seedDb();
    createOrResumeGsdGoal(db, {
      goalId: "goal-code-proof",
      title: "Verify code lane",
      actorAgentId: "agent-alpha",
      lane: "code",
    });

    const blocked = runGsdShipcheck(db, {
      goalId: "goal-code-proof",
      actorAgentId: "agent-alpha",
      lane: "code",
    });
    expect(blocked).toMatchObject({
      status: "blocked",
      missingProof: ["focused_tests"],
    });

    const verified = runGsdShipcheck(db, {
      goalId: "goal-code-proof",
      actorAgentId: "agent-alpha",
      lane: "code",
      proof: { focused_tests: "vitest 2 passed" },
    });
    expect(verified).toMatchObject({
      status: "verified",
      missingProof: [],
    });
    expect(verified.receiptId).toEqual(expect.any(Number));

    const resume = buildGsdResume(db, {
      goalId: "goal-code-proof",
      actorAgentId: "agent-alpha",
      lane: "code",
    });
    expect(resume.resume.latestProofReceipts.some((receipt) => receipt.includes("efficiency_events"))).toBe(false);
    expect(resume.ledger.verifications.some((verification) => verification.proofStatus === "verified")).toBe(true);
    db.close();
  });

  it("logs explicit bypass reasons and includes them in standup proof", () => {
    const db = seedDb();
    createOrResumeGsdGoal(db, {
      goalId: "goal-bypass",
      title: "Bypass with receipt",
      actorAgentId: "agent-alpha",
      lane: "deployment",
    });

    const shortBypass = runGsdShipcheck(db, {
      goalId: "goal-bypass",
      actorAgentId: "agent-alpha",
      lane: "deployment",
      bypassReason: "short",
    });
    expect(shortBypass.status).toBe("blocked");

    const bypassed = runGsdShipcheck(db, {
      goalId: "goal-bypass",
      actorAgentId: "agent-alpha",
      lane: "deployment",
      bypassReason: "manual deploy proof pending",
    });
    expect(bypassed).toMatchObject({
      status: "bypassed",
      missingProof: ["deploy_verification"],
    });

    const standup = buildGsdStandup(db, {
      goalId: "goal-bypass",
      actorAgentId: "agent-alpha",
    });
    expect(standup.activeGoals[0]).toMatchObject({ goalId: "goal-bypass" });
    expect(standup.recentProof[0]).toMatchObject({
      goalId: "goal-bypass",
      status: "bypassed",
      lane: "deployment",
    });
    db.close();
  });
});
