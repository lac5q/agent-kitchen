/**
 * End-to-end CLI smoke + production-integrity tests for the comparative
 * retrieval benchmark (VAL-RETR-001, 014, 026, 028, 030).
 *
 * Round-2 scrutiny fix: these tests assert REAL persisted audit evidence
 * via isolated SQLite inspection, not self-reported audit summaries. They
 * also assert that --no-write produces ZERO filesystem AND SQLite writes,
 * that injected audit failures block publication, and that contamination
 * failures block publication before report emission.
 *
 * The test is a black-box exec of the CLI under Node 22 + the ts-loader.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it, before, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const SCRIPT = path.resolve("scripts/run-comparative-retrieval-evals.mjs");
const NODE_22 = process.env.NODE_22_PATH || "/opt/homebrew/opt/node@22/bin/node";

function runCli(args, options = {}) {
  const env = { ...process.env, ...(options.env || {}) };
  const cwd = options.cwd || process.cwd();
  const result = spawnSync(
    NODE_22,
    ["--experimental-strip-types", SCRIPT, ...args],
    { cwd, env, encoding: "utf8", timeout: 60000 },
  );
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

function snapshotDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isFile()) {
      const content = fs.readFileSync(full);
      out[f] = {
        size: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
      };
    }
  }
  return out;
}

function diffSnapshot(a, b) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const k of Object.keys(b)) {
    if (!(k in a)) added.push(k);
    else if (a[k].sha256 !== b[k].sha256) changed.push(k);
  }
  for (const k of Object.keys(a)) {
    if (!(k in b)) removed.push(k);
  }
  return { changed, added, removed };
}

/**
 * Open the SQLite DB at the supplied path and count audit_entries rows
 * for the retrieval_bench chain domain. Returns null when the DB file
 * does not exist (no persistence side effect).
 */
function readBenchAuditRowCount(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  // We use the better-sqlite3 binary via a one-shot node child to avoid
  // pulling the TS toolchain into this CLI test.
  // Resolve the better-sqlite3 binding via the repo's root node_modules
  // so the helper can run from /tmp without a local node_modules. We
  // probe both common locations (root and apps/memroos) to handle
  // workspaces layouts.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bs3Candidates = [
    path.join(repoRoot, "apps", "memroos", "node_modules", "better-sqlite3"),
    path.join(repoRoot, "node_modules", "better-sqlite3"),
  ];
  const bs3Path = bs3Candidates.find((p) => fs.existsSync(p));
  if (!bs3Path) {
    throw new Error("better-sqlite3 not found at: " + bs3Candidates.join(", "));
  }
  const helper = `
    const Database = require(${JSON.stringify(bs3Path)});
    // spawnSync(NODE_22, [helperPath, dbPath]) => process.argv[0]=node, argv[1]=helperPath, argv[2]=dbPath.
    const targetPath = process.argv[2];
    const fs = require("fs");
    if (!fs.existsSync(targetPath)) {
      process.stdout.write(JSON.stringify({ rows: [], total: 0 }));
      process.exit(0);
    }
    const walPath = targetPath + "-wal";
    const shmPath = targetPath + "-shm";
    // If WAL exists, open read-write so we can checkpoint it.
    const needsCheckpoint = fs.existsSync(walPath);
    const db = new Database(targetPath, needsCheckpoint ? { readonly: false } : { readonly: true });
    try {
      if (needsCheckpoint) {
        db.pragma("journal_mode = WAL");
        db.pragma("wal_checkpoint(FULL)");
      }
      const rows = db.prepare(
        "SELECT event_type, COUNT(*) AS n FROM audit_entries " +
        "WHERE event_type LIKE 'retrieval_bench.%' GROUP BY event_type"
      ).all();
      const total = db.prepare(
        "SELECT COUNT(*) AS n FROM audit_entries " +
        "WHERE event_type LIKE 'retrieval_bench.%'"
      ).get();
      process.stdout.write(JSON.stringify({ rows, total: total.n }));
    } finally {
      db.close();
    }
  `;
  const helperPath = path.join(os.tmpdir(), "bench-audit-read-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".cjs");
  fs.writeFileSync(helperPath, helper);
  try {
    const r = spawnSync(NODE_22, [helperPath, dbPath], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error("better-sqlite3 read failed: " + r.stderr + r.stdout);
    }
    return JSON.parse(r.stdout);
  } finally {
    fs.unlinkSync(helperPath);
  }
}

function tempDbPath(label) {
  return path.join(os.tmpdir(), "bench-noop-" + label + "-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".db");
}

/**
 * Spawn the CLI with an isolated SQLITE_DB_PATH so the audit-row proof
 * can be inspected without contaminating the default app database.
 */
function runCliWithIsolatedDb(args, label) {
  const dbPath = tempDbPath(label);
  // Pre-create the SQLite file so the read helper can find it; the CLI
  // will refuse to write when --no-write is set so the file MUST be
  // either created (audit happens) or remain absent (no audit happens).
  const env = { SQLITE_DB_PATH: dbPath, ...process.env };
  const result = runCli(args, { env });
  return { ...result, dbPath };
}

describe("comparative retrieval CLI (VAL-RETR-001, 014, 026, 028, 030)", () => {
  let resultsDir;
  let beforeSnapshot;

  before(() => {
    resultsDir = path.resolve("evals/comparative-retrieval/results");
    beforeSnapshot = snapshotDir(resultsDir);
  });

  it("CLI smoke: --limit 25 --no-write --json completes with blocked publication", () => {
    // --no-write means no audit rows are persisted, so the publication
    // gate MUST be blocked (unverified receipts). Exit code 3 signals
    // blocked publication to CI deterministically.
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "25",
      "--no-write",
      "--json",
    ], "smoke");
    assert.equal(r.status, 3, "publication-blocked exit code expected (got " + r.status + "): " + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.dataset, "memroos_public_synthetic");
    assert.equal(j.adapter, "lexical");
    assert.equal(j.taskCount, 25, "exactly 25 tasks loaded");
    assert.ok(j.configHash.startsWith("sha256:"));
    assert.ok(j.fixtureHash.startsWith("sha256:"));
    assert.ok(j.publicationGate, "publication gate must be evaluated");
    // With --no-write, audit persistence is skipped; receipts unverified;
    // publication MUST be blocked.
    assert.equal(j.publicationGate.ok, false, "publication MUST be blocked under --no-write");
    assert.equal(j.publicationGate.status, "blocked_for_publication");
    assert.ok(
      j.publicationGate.caveats.some((c) => c.includes("audit_persistence_skipped_no_write")),
      "caveat must mention skipped-no-write audit state, got: " + JSON.stringify(j.publicationGate.caveats),
    );
    assert.ok(j.contamination, "contamination probe must be present");
    assert.equal(j.contamination.ok, false, "foreign-run contamination probe must trigger");
    assert.ok(j.replayHandle, "replay handle must be present");
    assert.ok(j.replayHandle.fingerprint.startsWith("sha256:"));
    assert.ok(j.auditPersistence, "audit persistence summary must be present");
    assert.equal(j.auditPersistence.allRequiredPersisted, false, "no audit must have been persisted");
    assert.equal(j.auditPersistence.anySkippedNoWrite, true, "every audit call must be skipped under --no-write");
    assert.equal(j.auditPersistence.allRequiredPersisted, false, "auditPersistence must show no required rows persisted under --no-write");
    assert.equal(j.auditPersistence.anySkippedNoWrite, true, "every audit call must be skipped under --no-write");
    // auditEmitted.runRecorded must reflect REAL persistence (skipWrite => not persisted).
    assert.equal(j.auditEmitted.runRecorded, false, "auditEmitted.runRecorded must reflect real persistence");
  });

  it("--no-write changes no files (filesystem snapshot proof)", () => {
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "5",
      "--no-write",
      "--json",
    ], "snapshot");
    assert.notEqual(r.status, 0, "exit code must be non-zero because publication is blocked");
    const afterSnapshot = snapshotDir(resultsDir);
    const d = diffSnapshot(beforeSnapshot, afterSnapshot);
    assert.equal(d.added.length, 0, "no files should be added: " + d.added.join(","));
    assert.equal(d.removed.length, 0, "no files should be removed: " + d.removed.join(","));
    assert.equal(d.changed.length, 0, "no files should be changed: " + d.changed.join(","));
  });

  it("--no-write performs ZERO filesystem AND SQLite audit writes (isolated DB inspection)", () => {
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "5",
      "--no-write",
      "--json",
    ], "noop-audit");
    // CLI must NOT have created the SQLite file because --no-write
    // forbids every persistence side effect including audit creation.
    assert.equal(
      fs.existsSync(r.dbPath),
      false,
      "--no-write must not create the SQLite database file at " + r.dbPath,
    );
    // readBenchAuditRowCount returns null when the file is absent.
    const auditCount = readBenchAuditRowCount(r.dbPath);
    assert.equal(auditCount, null, "audit rows must not exist when --no-write is armed");
  });

  it("normal run persists the full retrieval_bench audit chain (isolated DB inspection)", () => {
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "3",
      "--json",
    ], "persist-audit");
    // Publication is blocked by the foreign-run contamination probe (the
    // runner intentionally probes a foreign runId to assert contamination
    // detection). The audit chain itself MUST still be persisted.
    assert.equal(r.status, 3, "publication-blocked exit code expected (got " + r.status + "): " + r.stderr);
    const auditCount = readBenchAuditRowCount(r.dbPath);
    assert.ok(auditCount, "audit row count must be readable for the isolated DB");
    const byType = Object.fromEntries(auditCount.rows.map((x) => [x.event_type, x.n]));
    // Run-level + per-task receipts + publication + replay + contamination.
    assert.ok(byType["retrieval_bench.run"] >= 1, "run-level audit row must exist: " + JSON.stringify(byType));
    assert.equal(byType["retrieval_bench.receipt"], 3, "one receipt per task must exist");
    assert.ok(byType["retrieval_bench.publication"] >= 1, "publication audit row must exist");
    assert.ok(byType["retrieval_bench.replay"] >= 1, "replay audit row must exist");
    assert.ok(byType["retrieval_bench.contamination"] >= 1, "contamination audit row must exist");
    const j = JSON.parse(r.stdout);
    assert.equal(j.auditPersistence.allRequiredPersisted, true, "every required audit must be persisted");
    assert.equal(j.auditPersistence.anySkippedNoWrite, false, "no skips allowed in audit chain");
    // Publication MUST be blocked by the contamination probe (foreign-run).
    assert.equal(j.publicationGate.ok, false, "publication MUST be blocked by contamination probe");
    assert.ok(
      j.publicationGate.caveats.some((c) => c.includes("contamination_failed")),
      "caveat must mention contamination_failed, got: " + JSON.stringify(j.publicationGate.caveats),
    );
  });

  it("deterministic reruns: configHash / fixtureHash / aggregate identical", () => {
    const a = JSON.parse(runCli(["--dataset", "memroos_public_synthetic", "--limit", "5", "--no-write", "--json"]).stdout);
    const b = JSON.parse(runCli(["--dataset", "memroos_public_synthetic", "--limit", "5", "--no-write", "--json"]).stdout);
    assert.equal(a.configHash, b.configHash, "configHash must match across reruns");
    assert.equal(a.fixtureHash, b.fixtureHash, "fixtureHash must match across reruns");
    assert.equal(a.aggregate.precisionAtK, b.aggregate.precisionAtK, "precision@k must match");
    assert.equal(a.aggregate.recallAtK, b.aggregate.recallAtK, "recall@k must match");
    assert.equal(a.aggregate.mrr, b.aggregate.mrr, "MRR must match");
  });

  it("strict parser rejects malformed flags without consuming next option", () => {
    const r = runCli(["--dataset"]);
    assert.notEqual(r.status, 0, "missing flag value must fail");
    assert.ok(/missing_value_for_flag/i.test(r.stderr + r.stdout), "parser error must be visible");
  });

  it("direct runBenchmark without CLI parser is rejected (canonical governed pipeline)", () => {
    // The production runner now refuses to bypass the strict CLI
    // parser. Direct callers that have not pre-parsed with
    // parseCliArgs receive a typed `cli_parser_required` reason.
    const fixturesDir = path.resolve("evals/comparative-retrieval/fixtures").replace(/\\/g, "/");
    const benchPath = path.resolve("apps/memroos/src/lib/retrieval-bench/index.ts").replace(/\\/g, "/");
    const helperBody = `
      const bench = await import('${benchPath}');
      const r = await bench.runBenchmark({
        dataset: 'memroos_public_synthetic',
        adapter: 'lexical',
        limit: 1,
        k: 3,
        seed: 0,
        fixturesDir: '${fixturesDir}',
        withAudit: false,
        // NOTE: deliberately no cliCommand and no bypassCliParser.
      });
      console.log("RESULT:" + JSON.stringify({ ok: r.ok, reason: r.reason, issues: r.issues }));
    `;
    const helper = `
      import { register } from "node:module";
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      const __dirname = ${JSON.stringify(path.resolve("scripts"))};
      register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));
      (async () => {
        try { ${helperBody} }
        catch (e) { console.error("helper error: " + (e && e.message ? e.message : String(e))); process.exit(2); }
      })();
    `;
    const helperPath = path.join(os.tmpdir(), "bench-helper-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".mjs");
    fs.writeFileSync(helperPath, helper);
    try {
      const r = spawnSync(NODE_22, ["--experimental-strip-types", helperPath], { encoding: "utf8" });
      assert.equal(r.status, 0, "helper must succeed: " + r.stderr + r.stdout);
      const m = r.stdout.match(/RESULT:(.+?)(?:\n|$)/);
      assert.ok(m, "RESULT line must be present: " + r.stdout);
      const result = JSON.parse(m[1]);
      assert.equal(result.ok, false, "direct runBenchmark without CLI parser must be rejected");
      assert.equal(result.reason, "cli_parser_required");
    } finally {
      fs.unlinkSync(helperPath);
    }
  });

  it("publication gate blocks when audit persistence fails (injected sink)", () => {
    // Use the test sink hook to force every audit write to FAIL with a
    // typed persistence_failed outcome. The runner must surface the
    // failure in auditPersistence and BLOCK publication, even when the
    // dataset/aggregate metrics themselves are clean.
    const fixturesDir = path.resolve("evals/comparative-retrieval/fixtures").replace(/\\/g, "/");
    const benchPath = path.resolve("apps/memroos/src/lib/retrieval-bench/index.ts").replace(/\\/g, "/");
    const auditChainPath = path.resolve("apps/memroos/src/lib/retrieval-bench/modules/audit-chain.ts").replace(/\\/g, "/");
    const helperBody = `
      const bench = await import('${benchPath}');
      const auditChain = await import('${auditChainPath}');
      // Inject a sink that always fails persistence.
      auditChain.setBenchAuditSink(() => ({
        ok: false,
        status: "persistence_failed",
        reason: "injected_failure_for_test",
      }));
      const r = await bench.runBenchmark({
        dataset: 'memroos_public_synthetic',
        adapter: 'lexical',
        limit: 1,
        k: 3,
        seed: 0,
        fixturesDir: '${fixturesDir}',
        withAudit: true,
        bypassCliParser: true,
        cliCommand: { noWrite: false, outputDir: "/tmp/bench-noop-output", configOverrides: {} },
      });
      console.log("RESULT:" + JSON.stringify({
        ok: r.ok,
        publicationGate: r.ok ? r.publicationGate : null,
        auditPersistence: r.ok ? r.auditPersistence : null,
      }));
      auditChain.resetBenchAuditSink();
    `;
    const helper = `
      import { register } from "node:module";
      import path from "node:path";
      import { pathToFileURL } from "node:url";
      const __dirname = ${JSON.stringify(path.resolve("scripts"))};
      register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));
      (async () => {
        try { ${helperBody} }
        catch (e) {
          console.error("helper error: " + (e && e.message ? e.message : String(e)));
          process.exit(2);
        }
      })();
    `;
    const helperPath = path.join(os.tmpdir(), "bench-helper-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".mjs");
    fs.writeFileSync(helperPath, helper);
    try {
      const r = spawnSync(NODE_22, ["--experimental-strip-types", helperPath], { encoding: "utf8" });
      assert.equal(r.status, 0, "helper must succeed: " + r.stderr + r.stdout);
      const m = r.stdout.match(/RESULT:(.+?)(?:\n|$)/);
      assert.ok(m, "RESULT line must be present: " + r.stdout);
      const j = JSON.parse(m[1]);
      assert.equal(j.ok, true, "run must complete even when audit persistence fails");
      assert.equal(j.publicationGate.ok, false, "publication MUST be blocked when audit persistence fails");
      assert.equal(j.publicationGate.status, "blocked_for_publication");
      assert.ok(
        j.publicationGate.caveats.some((c) => c.includes("audit_persistence_failed")),
        "caveat must mention audit_persistence_failed, got: " + JSON.stringify(j.publicationGate.caveats),
      );
      assert.equal(j.auditPersistence.allRequiredPersisted, false, "auditPersistence must reflect failed persistence");
      assert.ok(
        (j.auditPersistence.run?.reason || "").includes("injected_failure_for_test") ||
          (j.auditPersistence.receipts || []).some((o) => (o.reason || "").includes("injected_failure_for_test")),
        "audit outcomes must carry the typed failure reason",
      );
    } finally {
      fs.unlinkSync(helperPath);
    }
  });

  it("contamination failure blocks publication before report emission (foreign-run probe)", () => {
    // The runner runs a foreign-run contamination probe against every
    // run. The probe's expected mismatch makes `foreignCheck.ok` false
    // and MUST block publication with an explicit caveat, even when
    // audit persistence succeeded.
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "2",
      "--json",
    ], "contamination");
    // Exit code 3 = blocked publication; contamination failure causes it.
    assert.equal(r.status, 3, "publication-blocked exit code expected (got " + r.status + "): " + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(j.contamination, "contamination probe must be present");
    assert.equal(j.contamination.ok, false, "foreign-run contamination probe MUST trigger");
    assert.equal(j.publicationGate.ok, false, "publication MUST be blocked when contamination probe fails");
    assert.ok(
      j.publicationGate.caveats.some((c) => c.includes("contamination_failed")),
      "caveat must mention contamination_failed, got: " + JSON.stringify(j.publicationGate.caveats),
    );
    // And the audit persistence state must STILL reflect successful persistence
    // because contamination failure is independent of audit persistence.
    assert.equal(j.auditPersistence.allRequiredPersisted, true, "audit chain must still verify cleanly");
    assert.equal(j.auditPersistence.anySkippedNoWrite, false, "no skips allowed in audit chain");
  });

  it("CLI surface text report contains all required sections", () => {
    const r = runCliWithIsolatedDb([
      "--dataset", "memroos_public_synthetic",
      "--limit", "5",
      "--no-write",
    ], "text-report");
    assert.notEqual(r.status, 0, "exit code must be non-zero because publication is blocked under --no-write");
    const text = r.stdout;
    assert.ok(text.includes("precision@k"), "text report must include precision@k");
    assert.ok(text.includes("recall@k"), "text report must include recall@k");
    assert.ok(text.includes("MRR"), "text report must include MRR");
    assert.ok(text.includes("Publication Gate"), "text report must include publication gate section");
    assert.ok(text.includes("Contamination Probe"), "text report must include contamination probe section");
    assert.ok(text.includes("Replay Handle"), "text report must include replay handle section");
    assert.ok(text.includes("Lane:"), "text report must include lane");
    assert.ok(text.includes("Audit Persistence"), "text report must include audit persistence section");
    assert.ok(text.includes("any_skipped_no_write"), "text report must surface any_skipped_no_write flag");
  });
});
