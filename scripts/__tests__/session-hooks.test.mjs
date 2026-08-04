import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function runHook(name, input, env) {
  const started = Date.now();
  const result = spawnSync("bash", [path.join(repoRoot, "scripts/hooks", name)], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { ...result, elapsedMs: Date.now() - started };
}

test("memory brief injects at most 600 tokens and capture failure is fail-open", () => {
  const hookRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-session-hooks-"));
  const bin = path.join(hookRoot, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const fakeCurl = path.join(bin, "curl");
  fs.writeFileSync(fakeCurl, `#!/bin/sh
if [ "${"$MEMROOS_TEST_CURL_MODE"}" = "brief" ]; then
  printf '%s' '{"ok":true,"items":[{"title":"Pointer","one_liner":"bounded pointer digest content","fetch_ref":"memory://prior-work/0"}]}'
else
  exit 28
fi
`);
  fs.chmodSync(fakeCurl, 0o755);
  const hookEnv = {
    MEMROOS_BASE_URL: "http://memroos.test",
    MEMROOS_HOOK_ROOT: hookRoot,
    MEMROOS_TEST_CURL_MODE: "brief",
    PATH: `${bin}:${process.env.PATH}`,
  };

  const brief = runHook(
    "memroos-memory-brief.sh",
    JSON.stringify({ repo: "memroos-product", branch: "phase-192", cwd: repoRoot, goal: "self capture" }),
    hookEnv,
  );
  assert.equal(brief.status, 0);
  assert.ok(brief.stdout.trim().length > 0);
  assert.ok(brief.stdout.trim().split(/\s+/).length <= 600);
  assert.match(fs.readFileSync(path.join(hookRoot, "hook-receipts/session-hooks.jsonl"), "utf8"), /memory_brief_hit/);

  const captureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-capture-fail-"));
  const capture = runHook(
    "memroos-capture-gate.sh",
    JSON.stringify({ sourceAgentId: "codex", runtime: "codex", sessionId: "failure-test" }),
    { ...hookEnv, MEMROOS_TEST_CURL_MODE: "failure", MEMROOS_HOOK_ROOT: captureRoot },
  );
  assert.equal(capture.status, 0);
  assert.ok(capture.elapsedMs < 5000, `capture hook exceeded bound: ${capture.elapsedMs}ms`);
  assert.equal(capture.stdout, "");
  assert.match(fs.readFileSync(path.join(captureRoot, "hook-receipts/session-hooks.jsonl"), "utf8"), /capture_gate_failure/);

  fs.rmSync(hookRoot, { recursive: true, force: true });
  fs.rmSync(captureRoot, { recursive: true, force: true });
});
