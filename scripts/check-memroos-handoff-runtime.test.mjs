import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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
  assert.match(script, /not_configured/);
  assert.match(script, /select\(\$status != "up"/);
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
