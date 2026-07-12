// @vitest-environment node
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs, updateCronJobStatus, upsertCronHealthJob } from "@/lib/cron-health";
import { listTaskEvidenceBundles, upsertTaskEvidenceBundle } from "@/lib/evidence/task-bundles";
import { buildSkillSuggestionAudit } from "@/lib/skills/activity-suggestions";

let db: Database.Database;
let tempRoot: string;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-v5-"));
});

afterEach(() => {
  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("v5 cron health, evidence bundles, and skill suggestions", () => {
  it("seeds declarative cron jobs and supports pause/resume state", () => {
    const jobs = listCronHealthJobs(db);
    expect(jobs.some((job) => job.id === "memory-consolidation")).toBe(true);

    const paused = updateCronJobStatus(db, "memory-consolidation", "paused");
    expect(paused).toMatchObject({ id: "memory-consolidation", status: "paused", health: "paused" });

    const resumed = updateCronJobStatus(db, "memory-consolidation", "active");
    expect(resumed).toMatchObject({ id: "memory-consolidation", status: "active" });
  });

  it("marks stale active jobs as warning instead of silently green", () => {
    const stale = upsertCronHealthJob(db, {
      id: "gmail-ingest",
      name: "Gmail ingest",
      sourceFamily: "gmail",
      schedule: "hourly",
      expectedIntervalMinutes: 60,
      lastRunAt: "2026-01-01T00:00:00.000Z",
    });

    expect(stale).toMatchObject({ health: "warning", caughtUp: false });
  });

  it("persists universal task evidence bundles by task id", () => {
    const bundle = upsertTaskEvidenceBundle(db, {
      taskId: "task-123",
      plan: ["assemble context"],
      tools: [{ name: "npm test", status: "passed" }],
      verification: ["focused test suite"],
      memories: ["memory:approved:1"],
      residualRisks: ["public smoke still pending"],
      status: "verified",
      orchestrationRunId: "orch-run-1",
      orchestrationPlanHash: "plan-hash-1",
      orchestrationBundleHash: "bundle-hash-1",
    });

    expect(bundle.status).toBe("verified");
    expect(bundle.tools).toEqual([{ name: "npm test", status: "passed" }]);
    expect(bundle.orchestrationRunId).toBe("orch-run-1");
    expect(bundle.orchestrationPlanHash).toBe("plan-hash-1");
    expect(bundle.orchestrationBundleHash).toBe("bundle-hash-1");
    expect(listTaskEvidenceBundles(db, "task-123")).toHaveLength(1);
  });

  it("suggests MemRoOS-owned skills from repeated 30-day activity and compares harness coverage", () => {
    const codexRoot = path.join(tempRoot, "codex");
    const hermesSkills = path.join(tempRoot, "hermes-skills");
    fs.mkdirSync(path.join(codexRoot, "2026", "05", "24"), { recursive: true });
    fs.mkdirSync(path.join(hermesSkills, "agent-chat-provider-failover"), { recursive: true });
    fs.writeFileSync(
      path.join(codexRoot, "2026", "05", "24", "session.jsonl"),
      JSON.stringify({
        message: {
          content:
            "agent chat provider quota fallback dispatch model diagnostics provider fallback",
        },
      }) + "\n"
    );
    fs.writeFileSync(path.join(hermesSkills, "agent-chat-provider-failover", "SKILL.md"), "# skill\n");

    const suggestions = buildSkillSuggestionAudit({
      now: new Date("2026-05-24T00:00:00.000Z"),
      days: 30,
      activityRoots: { codex: codexRoot },
      skillRoots: { hermes: hermesSkills, memroos: path.join(tempRoot, "memroos-skills") },
    });

    const chatSuggestion = suggestions.find((s) => s.slug === "agent-chat-provider-failover");
    expect(chatSuggestion).toBeTruthy();
    expect(chatSuggestion?.comparedHarnesses.hermes.exists).toBe(true);
    expect(chatSuggestion?.comparedHarnesses.memroos.exists).toBe(false);
  });
});
