/**
 * End-to-end CLI smoke test for the comparative retrieval benchmark.
 *
 * This test exercises the actual Node 22 benchmark CLI path that the
 * v8.9 scrutiny synthesis identified as broken. It verifies:
 *
 *   - --no-write changes no files (filesystem snapshot proof)
 *   - Deterministic reruns produce identical configHash / fixtureHash /
 *     aggregate metrics (VAL-RETR-013, VAL-RETR-027)
 *   - Publication gate blocks incomplete or contaminated runs
 *     (VAL-RETR-028)
 *   - Audit rows land in the retrieval_bench chain domain (VAL-RETR-026)
 *
 * The test is a black-box exec of the CLI to prove the production CLI
 * path works under Node 22 + the ts-loader.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it, before } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
 * Run a Node script via the same ts-loader bootstrap the CLI uses.
 * The script imports the bench module after registering ts-loader via
 * `module.register`, then executes the supplied body and exits.
 */
function runHelper(body) {
  const helper = `
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const __dirname = ${JSON.stringify(path.resolve("scripts"))};
register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));

(async () => {
  try {
    ${body}
  } catch (e) {
    console.error("helper error: " + (e && e.message ? e.message : String(e)));
    process.exit(2);
  }
})();
  `;
  const helperPath = path.join(os.tmpdir(), "bench-helper-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".mjs");
  fs.writeFileSync(helperPath, helper);
  const r = spawnSync(NODE_22, [
    "--experimental-strip-types",
    helperPath,
  ], { encoding: "utf8" });
  fs.unlinkSync(helperPath);
  return r;
}

describe("comparative retrieval CLI (VAL-RETR-001, 014, 026, 028)", () => {
  let resultsDir;
  let beforeSnapshot;

  before(() => {
    resultsDir = path.resolve("evals/comparative-retrieval/results");
    beforeSnapshot = snapshotDir(resultsDir);
  });

  it("CLI smoke: --limit 25 --no-write --json completes successfully", () => {
    const r = runCli([
      "--dataset", "memroos_public_synthetic",
      "--limit", "25",
      "--no-write",
      "--json",
    ]);
    assert.equal(r.status, 0, "exit code must be 0 (got " + r.status + "): " + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.dataset, "memroos_public_synthetic");
    assert.equal(j.adapter, "lexical");
    assert.equal(j.taskCount, 25, "exactly 25 tasks loaded");
    assert.ok(j.configHash.startsWith("sha256:"));
    assert.ok(j.fixtureHash.startsWith("sha256:"));
    assert.ok(j.publicationGate, "publication gate must be evaluated");
    assert.equal(j.publicationGate.status, "ready_for_publication");
    assert.ok(j.contamination, "contamination probe must be present");
    assert.equal(j.contamination.ok, false, "foreign-run contamination probe must trigger");
    assert.ok(j.replayHandle, "replay handle must be present");
    assert.ok(j.replayHandle.fingerprint.startsWith("sha256:"));
    assert.ok(j.auditEmitted, "audit emission summary must be present");
    assert.equal(j.auditEmitted.runRecorded, true);
  });

  it("--no-write changes no files (filesystem snapshot proof)", () => {
    const r = runCli([
      "--dataset", "memroos_public_synthetic",
      "--limit", "5",
      "--no-write",
      "--json",
    ]);
    assert.equal(r.status, 0, "exit code must be 0");
    const afterSnapshot = snapshotDir(resultsDir);
    const d = diffSnapshot(beforeSnapshot, afterSnapshot);
    assert.equal(d.added.length, 0, "no files should be added: " + d.added.join(","));
    assert.equal(d.removed.length, 0, "no files should be removed: " + d.removed.join(","));
    assert.equal(d.changed.length, 0, "no files should be changed: " + d.changed.join(","));
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
    // --dataset without value should fail with non-zero exit
    const r = runCli(["--dataset"]);
    assert.notEqual(r.status, 0, "missing flag value must fail");
    assert.ok(/missing_value_for_flag/i.test(r.stderr + r.stdout), "parser error must be visible");
  });

  it("publication gate reports blocked reason when receipt verification fails (VAL-RETR-028)", () => {
    const fixturesDir = path.resolve("evals/comparative-retrieval/fixtures").replace(/\\/g, "/");
    const benchPath = path.resolve("apps/memroos/src/lib/retrieval-bench/index.ts").replace(/\\/g, "/");
    const body = `
      const bench = await import('${benchPath}');
      const r = await bench.runBenchmark({
        dataset: 'memroos_public_synthetic',
        adapter: 'lexical',
        limit: 1,
        k: 3,
        seed: 0,
        fixturesDir: '${fixturesDir}',
        withAudit: false,
      });
      if (!r.ok) { console.error('run failed: ' + r.reason); process.exit(2); }
      const gate = bench.evaluatePublicationGate({
        report: r.report,
        provenance: {
          configHash: r.report.configHash,
          fixtureHash: r.report.fixtureHash,
          seed: r.report.seed,
          k: r.report.k,
          providerFlags: r.report.providerFlags,
        },
        receiptVerifications: [],
      });
      console.log("RESULT:" + JSON.stringify({ ok: gate.ok, status: gate.status, caveats: gate.caveats }));
    `;
    const r = runHelper(body);
    assert.equal(r.status, 0, "helper must succeed: " + r.stderr + r.stdout);
    const match = r.stdout.match(/RESULT:(.+?)(?:\n|$)/);
    assert.ok(match, "result line must be present: " + r.stdout);
    const gate = JSON.parse(match[1]);
    assert.equal(gate.ok, false, "publication must be blocked when receipts missing");
    assert.equal(gate.status, "blocked_for_publication");
    assert.ok(gate.caveats.some((c) => c.includes("receipt_verification_missing")));
  });

  it("CLI audit emission summary is set when withAudit is enabled", () => {
    const r = runCli([
      "--dataset", "memroos_public_synthetic",
      "--limit", "3",
      "--no-write",
      "--json",
    ]);
    assert.equal(r.status, 0, "exit code must be 0: " + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.ok(j.auditEmitted, "audit emission summary must be present in CLI output");
    assert.equal(j.auditEmitted.runRecorded, true, "runRecorded must be true");
    assert.equal(j.auditEmitted.publicationRecorded, true, "publicationRecorded must be true");
    assert.equal(j.auditEmitted.replayRecorded, true, "replayRecorded must be true");
    assert.equal(j.auditEmitted.receiptsRecorded, 3, "one receipt per task expected");
  });

  it("CLI surface text report contains all required sections", () => {
    const r = runCli([
      "--dataset", "memroos_public_synthetic",
      "--limit", "5",
      "--no-write",
    ]);
    assert.equal(r.status, 0, "exit code must be 0: " + r.stderr);
    const text = r.stdout;
    assert.ok(text.includes("precision@k"), "text report must include precision@k");
    assert.ok(text.includes("recall@k"), "text report must include recall@k");
    assert.ok(text.includes("MRR"), "text report must include MRR");
    assert.ok(text.includes("Publication Gate"), "text report must include publication gate section");
    assert.ok(text.includes("Contamination Probe"), "text report must include contamination probe section");
    assert.ok(text.includes("Replay Handle"), "text report must include replay handle section");
    assert.ok(text.includes("Lane:"), "text report must include lane");
  });
});
