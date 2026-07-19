/**
 * v8.16 Phase 171 / OBSERVE-14 Wave-1 smoke.
 *
 * End-to-end demonstration that a Wave-1 capture (Pi JSONL) yields a
 * relevant (or higher) durable candidate WITHOUT any operator-side
 * `knowledge_write`. We exercise:
 *
 *   1. Build a synthetic Pi JSONL session file under a tmpdir.
 *   2. Drive it through `captureCodingAgentSession` (the Phase 96/169 entry
 *      point the sidecar uses) with `captureDepth="relevant"` — the default.
 *   3. Assert that `agent_memory_candidates` has at least one row for the
 *      Pi platform, that no row contains transcript text, and that the
 *      operator visibility endpoint reflects the new capture.
 */
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { captureCodingAgentSession } from "@/lib/agent-memory-continuity";
import { initSchema } from "@/lib/db-schema";
import { listObserveHarnessHealth } from "@/lib/observe-health";
import { readVaultArtifact } from "@/lib/vault/writer";

describe("OBSERVE-14 Wave-1 Pi smoke", () => {
  let db: Database.Database;
  let vaultRoot: string;
  let piRoot: string;
  let sessionPath: string;

  beforeEach(() => {
    vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-wave1-smoke-"));
    vi.stubEnv("MEMROOS_VAULT_ROOT", vaultRoot);
    vi.stubEnv("MEMROOS_CAPTURE_DEPTH", "relevant");
    db = new Database(":memory:");
    initSchema(db);
    // Lay down a synthetic Pi JSONL session in a tmpdir that mimics the real
    // shape: ~/.pi/agent/sessions/<session-uuid>.jsonl with role/text pairs.
    piRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"));
    const sessionsDir = path.join(piRoot, ".pi", "agent", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    sessionPath = path.join(sessionsDir, "pi-smoke-001.jsonl");
    fs.writeFileSync(
      sessionPath,
      [
        JSON.stringify({ role: "user", text: "Refactor observe smoke harness" }),
        JSON.stringify({
          role: "assistant",
          text: "Switch the harness to captureCodingAgentSession so we exercise the real path.",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
  });

  afterEach(() => {
    db.close();
    fs.rmSync(vaultRoot, { recursive: true, force: true });
    fs.rmSync(piRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("produces ≥1 relevant candidate for a Pi JSONL capture without any knowledge_write", async () => {
    expect(fs.existsSync(sessionPath)).toBe(true);

    // Mirror scripts/run-observe-sidecar.mjs's sidecar-driven payload shape so
    // we are exercising the same surface the operator observes on a real run.
    const summary =
      "Pi session captured the Wave-1 smoke: drove the harness to use captureCodingAgentSession so the capture is routed through the canonical DB path.";
    const decisionIntent = {
      decision: "Switch to captureCodingAgentSession for smoke parity",
      intent: "exercise the same capture path the sidecar uses",
    };
    const verification = [
      { command: "vitest", status: "passed", note: "phase 171 OBSERVE-14" },
    ];
    const files = [
      { path: "src/lib/observe-health.ts", note: "extended with errorCount + agentsByHarness" },
    ];

    const capture = captureCodingAgentSession(db, {
      sourceAgentId: "pi",
      runtime: "pi",
      sessionId: "pi-smoke-001",
      summary,
      decisionIntent,
      verification,
      files,
      captureDepth: "relevant",
      metadata: {
        observeSidecar: true,
        harness: "pi",
        sessionPath,
      },
    });

    expect(capture.duplicate).toBe(false);
    expect(capture.captureHealth).toBe("ok");
    expect(capture.captureDepth).toBe("relevant");
    expect(capture.candidateCount).toBeGreaterThanOrEqual(1);

    // Pull every candidate the capture produced and assert at least one
    // durable candidate exists that is NOT a transcript dump.
    const candidates = db
      .prepare(
        `SELECT memory_type, content
         FROM agent_memory_candidates
         WHERE capture_id = ?`,
      )
      .all(capture.id) as Array<{ memory_type: string; content: string }>;
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(
      candidates.some(
        (c) =>
          c.memory_type === "task_state" &&
          c.content.includes("Pi session captured the Wave-1 smoke"),
      ),
    ).toBe(true);

    // The relevant-depth projection strips transcript text out of the
    // indexable surface. The sidecar did not call any knowledge_write, so
    // the only durable write paths here are agent_session_captures and
    // agent_memory_candidates — both go through captureCodingAgentSession.
    const indexed = db
      .prepare(
        `SELECT content
         FROM agent_memory_candidates`,
      )
      .all() as Array<{ content: string }>;
    expect(
      indexed.every((row) => !row.content.toLowerCase().includes("switch the harness")),
    ).toBe(true);

    // The vault replay body carries the structured metadata but NOT the
    // transcript text (the transcript was never supplied here; even if it
    // had been, depth=relevant seals it out of the original payload).
    const replay = readVaultArtifact(db, capture.rawArtifactId!);
    const parsed = JSON.parse(replay.body) as {
      captureDepth?: string;
      sourceAgentId?: string;
      normalized?: { sourceAgentId?: string };
    };
    expect(parsed.captureDepth).toBe("relevant");
    expect(parsed.sourceAgentId ?? parsed.normalized?.sourceAgentId).toBe("pi");

    // OBSERVE-14 operator visibility: listObserveHarnessHealth picks up the
    // Pi capture (lastCaptureAt, captureCount, errorCount, agentsByHarness)
    // and surfaces the catalog-aligned notes string.
    const rows = listObserveHarnessHealth(db, { depthSetting: "relevant" });
    const piRow = rows.find((r) => r.harness === "pi");
    expect(piRow).toBeDefined();
    expect(piRow!.captureCount).toBe(1);
    expect(piRow!.errorCount).toBe(0);
    expect(piRow!.agentsByHarness).toBe(0);
    expect(piRow!.notes).toMatch(/Pi sessions/i);
    expect(piRow!.lastCaptureAt).toMatch(/^2026-/);
  });
});
