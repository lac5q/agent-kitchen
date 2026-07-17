---
name: beastmode-qwen-cloud
description: Backward-compatible Beastmode entrypoint. Prefer beastmode-cloud for pluggable Qwen, Droid MiniMax, GLM, and other model workers.
---

# Beastmode Qwen Cloud

Use this skill when Luis asks for Beastmode, Qwen, cheap-worker execution, or a
planner/worker/validator pattern inside Codex Cloud.

This is the legacy Qwen-specific entrypoint. For new Beastmode runs, prefer
`$beastmode-cloud`, which supports Qwen plus Droid models such as `minimax-m3`,
GLM, and other configured Factory models.

Codex Cloud does not make Qwen a native Codex model. This skill implements one
worker lane by using Qwen as an external executor CLI:

- Director: Codex in the current session.
- Worker: `~/.local/bin/qwen-agent` using `qwen3.7-plus`.
- Validator: Codex in the current session, plus repo tests/checks.

## Start Gate

Confirm the Qwen lane is real before using it for work:

```bash
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

If this fails because `DASHSCOPE_API_KEY` is missing, continue as Codex-only and
report that Beastmode is statically installed but the Qwen worker is not
live-verified.

## Operating Loop

1. Codex writes the plan, scope, acceptance checks, and blast-radius notes.
2. Codex delegates only a bounded executor slice to Qwen.
3. Qwen returns a patch, findings, or an implementation transcript.
4. Codex reviews all output, applies only acceptable changes, and runs checks.
5. Codex records what actually happened: installed, delegated, verified, or
   blocked.

## Qwen Worker Contract

Every Qwen prompt must include:

- The exact repo path and task objective.
- Allowed files or directories.
- Commands Qwen may run.
- Commands Qwen must not run: commit, push, delete, publish, send email, access
  secrets, or change cloud configuration.
- Required output: unified diff, changed-files list, and verification notes.

Qwen should not receive raw private data, broad environment dumps, API keys, or
production credentials.

## Standard Worker Invocation

```bash
mkdir -p .codex/qwen-runs
run_dir=".codex/qwen-runs/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
You are the Qwen executor for a Codex-led Beastmode run.

REPO:
<absolute repo path>

TASK:
<bounded implementation or analysis slice>

ALLOWED FILES:
<paths>

ACCEPTANCE:
<checks>

DO NOT:
- Commit, push, delete, publish, send email, or access secrets.
- Modify files outside the allowed set.
- Claim verification you did not run.

OUTPUT:
- Summary.
- Unified diff or exact files changed.
- Commands run and results.
- Risks or blockers.
EOF
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "$(cat "$run_dir/prompt.md")" >"$run_dir/output.md" 2>&1
```

## Validator Duties

After Qwen returns:

```bash
git diff --stat
git diff --check
```

Then run the relevant test or build command. If the task touches app code,
prefer the repo scripts (`npm run typecheck`, `npm run lint`, `npm test -- --run`,
or narrower checks) over unreviewed ad hoc validation.

Do not present the work as done until Codex has inspected the diff and run the
relevant verification.
