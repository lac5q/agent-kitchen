import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    text: true,
    encoding: "utf8",
    ...options,
  });
  return result;
}

{
  const script = readFileSync(path.join(repoRoot, "scripts/memroos-mcp.sh"), "utf8");
  assert.match(script, /MEMROOS_ALLOWED_MEMORY_TIER_STATUSES/);
  assert.match(script, /MEMROOS_MCP_STRICT_CHECK_ATTEMPTS/);
  assert.match(script, /--strict-memory-check/);
  assert.match(script, /not_configured/);
  assert.match(script, /select\(\$status != "up"/);
}

{
  const tempDir = mkdtempSync(path.join(tmpdir(), "memroos-strict-check-"));
  const binDir = path.join(tempDir, "bin");
  const stateFile = path.join(tempDir, "health-count");
  run("mkdir", ["-p", binDir]);
  const fakeCurl = path.join(binDir, "curl");
  writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    -*)
      if [[ $# -gt 1 && "$2" != -* ]]; then shift 2; else shift; fi
      ;;
    http://*|https://*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
if [[ "$url" == *"/api/agent-context/messages"* ]]; then
  printf '{"ok":true,"messages":[]}' > "$out"
elif [[ "$url" == *"/api/memory/health"* ]]; then
  count=0
  [[ -f "${stateFile}" ]] && count="$(cat "${stateFile}")"
  count=$((count + 1))
  printf "%s" "$count" > "${stateFile}"
  if [[ "$count" -eq 1 ]]; then
    printf '{"ok":true,"tiers":[{"tier":"vector","status":"down"},{"tier":"graph","status":"not_configured"}]}' > "$out"
  else
    printf '{"ok":true,"tiers":[{"tier":"vector","status":"up"},{"tier":"graph","status":"not_configured"}]}' > "$out"
  fi
else
  printf '{"ok":false}' > "$out"
fi
printf '200'
`);
  chmodSync(fakeCurl, 0o755);

  const result = run("bash", ["scripts/memroos-mcp.sh", "--strict-memory-check"], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      MEMROOS_REQUIRE_SERVER_MEMORY: "1",
      MEMROOS_AGENT_ID: "codex-desktop-luis-mbp",
      MEMROOS_AGENT_API_KEY: "ak_test",
      MEMROOS_MCP_STRICT_CHECK_ATTEMPTS: "2",
      MEMROOS_MCP_STRICT_CHECK_RETRY_DELAY_SEC: "0",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /attempt 1\/2 failed: memory tiers are not healthy: vector=down/);
  assert.match(result.stderr, /strict memory check recovered on attempt 2\/2/);
  assert.match(result.stderr, /strict memory check passed/);
}

{
  const tempRepo = mkdtempSync(path.join(tmpdir(), "memroos-handoff-hook-"));
  const planningDir = path.join(tempRepo, ".planning");
  run("mkdir", ["-p", planningDir]);
  writeFileSync(path.join(planningDir, "GOAL_STATE.md"), "# Goal State\n\nstatus: dry-run test\n");

  const hookPayload = JSON.stringify({ cwd: tempRepo, session_id: "dry-run-session" });
  const result = run("bash", ["scripts/claude-goal-state-handoff-hook.sh", "--dry-run"], {
    input: hookPayload,
    env: {
      ...process.env,
      MEMROOS_GOAL_STATE_HANDOFF_DRY_RUN: "1",
      MEMROOS_AGENT_ID: "claude-code-luis-mbp",
      MEMROOS_HANDOFF_TO_AGENT: "codex-desktop-luis-mbp",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Goal-state handoff hook dry run/);
  assert.match(result.stdout, new RegExp(tempRepo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.stdout, /\.planning\/GOAL_STATE\.md/);
}
