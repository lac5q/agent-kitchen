---
name: beastmode-cloud
description: Run Codex- or Cursor-led Beastmode with pluggable external workers such as Qwen, direct MiniMax API, Droid MiniMax, GLM, or other Droid models.
---

# Beastmode Cloud

Use this skill when Luis asks for Beastmode, cheap-worker execution,
planner/worker/validator loops, Qwen, MiniMax, Droid, or multi-model coding
support in a cloud coding session.

The current agent stays the director, reviewer, and merge gate. External models
are bounded workers only. Never let a worker commit, push, access secrets, or
claim final verification.

## Worker Lanes

**Default priority (do not skip MiniMax when it is live):**

1. **MiniMax API (`MiniMax-M3`)** — preferred Beastmode worker whenever
   `MINIMAX_API_KEY` is set. Use this for cheap/worker patches, plans, analysis,
   and most implementation slices.
2. **Droid MiniMax (`minimax-m3`)** — fallback when the direct API lane is down
   or you specifically need Factory's agent runtime / tool access.
3. **Qwen (`qwen3.7-plus`)** — last-resort external executor when neither MiniMax
   lane is live-verified.
4. **Droid custom** — only when an explicit non-MiniMax Droid model is required.

| Lane | Default model | Command | Smoke gate |
|------|---------------|---------|------------|
| MiniMax API | `MiniMax-M3` | `curl https://api.minimax.io/v1/chat/completions` | Must return `MINIMAX OK` |
| Droid MiniMax | `minimax-m3` | `~/.local/bin/droid exec --model minimax-m3` | `droid exec --model minimax-m3 "Reply with exactly: MINIMAX OK"` |
| Qwen | `qwen3.7-plus` | `~/.local/bin/qwen-agent` | Must return `QWEN OK` |
| Droid custom | any `droid exec --list-tools` model id | `~/.local/bin/droid exec --model <id>` | Model-specific exact reply |

Do not default to Qwen or director-only coding when MiniMax smoke passes.
Prefer an independent validator model when the authoring worker was MiniMax
(never MiniMax self-validation for high-risk / validator tiers).

## Reasoning Mode

MiniMax-M3 accepts only `thinking.type: adaptive` or `disabled` (not `enabled`
or `high`). For Beastmode **high reasoning**, use adaptive:

| Mode | `thinking.type` | When |
|------|-----------------|------|
| High reasoning (default worker) | `adaptive` | Plans, reviews, patches, gap analysis |
| Exact smoke / deterministic | `disabled` | `MINIMAX OK` gate and exact-string checks |

Override with `BEASTMODE_MINIMAX_THINKING=disabled` only when you need exact
output without chain-of-thought. Default worker runs should keep adaptive.

Adaptive reasoning can consume most of `max_completion_tokens` as
`reasoning_tokens`. For high-reasoning worker prompts: keep the task tight,
require a short final section outside any `<think>` tags, and prefer
`max_completion_tokens` ≥ 8192. If the transcript is think-only, re-prompt
once for the final patches/verdict only.

## Start Gate

Before delegating, prove the selected lane is live. Check MiniMax first:

```bash
# Direct MiniMax API smoke (exact string — thinking disabled)
curl -sS https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","thinking":{"type":"disabled"},"messages":[{"role":"user","content":"Reply with exactly: MINIMAX OK"}],"max_completion_tokens":20,"temperature":0}'

# High-reasoning readiness (adaptive)
curl -sS https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","thinking":{"type":"adaptive"},"messages":[{"role":"user","content":"Reply with exactly: MINIMAX ADAPTIVE OK"}],"max_completion_tokens":80,"temperature":0}'

# MiniMax through Droid (fallback)
~/.local/bin/droid exec --model minimax-m3 "Reply with exactly: MINIMAX OK"

# Qwen (last resort)
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

If the smoke check fails, continue without that worker and report the lane as
installed but not live-verified. If MiniMax fails, fall through Droid MiniMax →
Qwen and say so explicitly.

## Operating Loop

1. Director writes the plan, scope, allowed files, acceptance checks, and
   blast-radius notes.
2. Director delegates only a bounded executor slice to one worker lane.
3. Worker returns a patch, findings, or implementation transcript.
4. Director reviews all output, applies only acceptable changes, and runs checks.
5. Director records what actually happened: installed, delegated, verified, or
   blocked.

## Worker Contract

Every worker prompt must include:

- Exact repo path and task objective.
- Allowed files or directories.
- Commands the worker may run.
- Commands the worker must not run: commit, push, delete, publish, send email,
  access secrets, or change cloud configuration.
- Required output: summary, unified diff or exact files changed, commands run,
  verification notes, risks/blockers.

Workers should not receive raw private data, broad environment dumps, API keys,
production credentials, legal/financial mail, or other sensitive source text.

## Standard Qwen Invocation

```bash
mkdir -p .codex/beastmode-runs
run_dir=".codex/beastmode-runs/$(date -u +%Y%m%dT%H%M%SZ)-qwen"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
You are the bounded worker for a director-led Beastmode run.

REPO:
<absolute repo path>

TASK:
<bounded implementation or analysis slice>

ALLOWED FILES:
<paths>

ACCEPTANCE:
<checks>

DO NOT:
- Commit, push, delete, publish, send email, access secrets, or change cloud configuration.
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

## Standard Direct MiniMax API Invocation

```bash
mkdir -p .codex/beastmode-runs
run_dir=".codex/beastmode-runs/$(date -u +%Y%m%dT%H%M%SZ)-minimax-api"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
You are the bounded MiniMax worker for a director-led Beastmode run.

REPO:
<absolute repo path>

TASK:
<bounded implementation or analysis slice>

ALLOWED FILES:
<paths>

ACCEPTANCE:
<checks>

DO NOT:
- Commit, push, delete, publish, send email, access secrets, or change cloud configuration.
- Modify files outside the allowed set.
- Claim verification you did not run.

OUTPUT:
- Summary.
- Unified diff or exact files changed.
- Commands run and results.
- Risks or blockers.
EOF
cat >"$run_dir/invoke.cjs" <<'NODE'
const fs = require("fs");

const [promptPath, outputPath] = process.argv.slice(2);
const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  throw new Error("MINIMAX_API_KEY is required for the direct MiniMax API lane.");
}

const prompt = fs.readFileSync(promptPath, "utf8");
(async () => {
  const response = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.BEASTMODE_MINIMAX_MODEL || "MiniMax-M3",
      // High reasoning default: adaptive. Smoke gates may set disabled.
      thinking: {
        type:
          process.env.BEASTMODE_MINIMAX_THINKING === "disabled"
            ? "disabled"
            : "adaptive",
      },
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: 8192,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`MiniMax API ${response.status}: ${body.slice(0, 500)}`);
  }
  const parsed = JSON.parse(body);
  const message = parsed.choices?.[0]?.message || {};
  const content = message.content || "";
  const reasoning = message.reasoning_content || message.reasoning || "";
  fs.writeFileSync(
    outputPath,
    reasoning ? `<thinking>\n${reasoning}\n</thinking>\n\n${content}\n` : `${content}\n`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
BEASTMODE_MINIMAX_THINKING="${BEASTMODE_MINIMAX_THINKING:-adaptive}" \
  node "$run_dir/invoke.cjs" "$run_dir/prompt.md" "$run_dir/output.md"
```

Direct API workers cannot inspect the worktree or run tools themselves. Ask for
patches, plans, or review findings, then have the director apply and verify.
Default worker reasoning is `thinking.type: adaptive` (high reasoning). Use
`BEASTMODE_MINIMAX_THINKING=disabled` only for exact-output smoke tests.

## Standard Droid MiniMax Invocation

```bash
mkdir -p .codex/beastmode-runs
run_dir=".codex/beastmode-runs/$(date -u +%Y%m%dT%H%M%SZ)-minimax"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
You are the bounded MiniMax worker for a director-led Beastmode run.

REPO:
<absolute repo path>

TASK:
<bounded implementation or analysis slice>

ALLOWED FILES:
<paths>

ACCEPTANCE:
<checks>

DO NOT:
- Commit, push, delete, publish, send email, access secrets, or change cloud configuration.
- Modify files outside the allowed set.
- Claim verification you did not run.

OUTPUT:
- Summary.
- Unified diff or exact files changed.
- Commands run and results.
- Risks or blockers.
EOF
~/.local/bin/droid exec --auto low --model "${BEASTMODE_DROID_MODEL:-minimax-m3}" -f "$run_dir/prompt.md" >"$run_dir/output.md" 2>&1
```

Use `--auto low` for documentation or small code edits. Use read-only Droid
mode for analysis. Raise autonomy only when the director explicitly approves the
risk and the environment is isolated.

## Validator Duties

After any worker returns:

```bash
git diff --stat
git diff --check
```

Then run the relevant test or build command. If the task touches app code,
prefer repo scripts (`npm run typecheck`, `npm run lint`, `npm test -- --run`,
or narrower checks) over unreviewed ad hoc validation.

Do not present the work as done until the director has inspected the diff and
run relevant verification.
