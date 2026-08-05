---
name: beastmode-cloud
description: Run Codex- or Cursor-led Beastmode with GPT-5.6 Luna as the default bounded worker, plus explicitly configured fallback worker lanes.
---

# Beastmode Cloud

Use this skill when Luis asks for Beastmode, bounded worker execution,
planner/worker/validator loops, Luna Max, Droid, or multi-model coding support
in a cloud coding session.

The current agent stays the director, reviewer, and merge gate. External models
are bounded workers only. Never let a worker commit, push, access secrets, or
claim final verification.

> Current worker lane: Luna Max (`gpt-5.6-luna` / `custom:gpt-5.6-luna-[VP]-0`) at
> maximum reasoning. The MiniMax and Qwen sections below are retained only as
> historical audit notes and must not be used for new work.

## Goal memory checkpoints

At the start of every Beastmode goal, call the named `memory_prior_work` probe
with the goal statement, repo/project scope, and `timing: "before_plan"`.
Record its returned `receipt` (or receipt id when supplied), including a typed
`search_skipped` result, before dispatching any worker. Re-probe after a topic
shift, unexpected error, repeated question, or before guessing at a convention.

At goal close, make a governed `agent_memory_save` for durable decisions,
outcomes, project facts, or handoff state with outcome, scope, entities, and
provenance. If no learning is justified or the service is unavailable, record
a typed skip/error receipt instead. The director owns both checkpoints and
must verify the receipt; workers do not claim them.

## Worker Lanes

Choose the lane that is installed and authenticated on the host:

| Lane | Default model | Command | Smoke gate |
|------|---------------|---------|------------|
| **Luna Max (preferred)** | `gpt-5.6-luna` | `~/.local/bin/droid exec --model custom:gpt-5.6-luna-[VP]-0` or the configured Pi/Codex lane | Must return `DROID_LUNA_OK` with reasoning `max` |
| Droid custom fallback | any explicitly configured `droid exec --list-tools` model id | `~/.local/bin/droid exec --model <id>` | Model-specific exact reply |

Prefer Luna Max for bounded worker slices and set reasoning to `max`. Use the
Factory Droid custom model when the worker needs tool access. Keep the director
as the independent reviewer and merge gate.

### Retired MiniMax lane (historical troubleshooting only)

**1. A present key is not a usable key.** `.zshrc` on the operator Mac exports
`MINIMAX_API_KEY` from `~/.cache/shell/zsh_secrets`, a file that does not exist —
leaving an 18-character placeholder in the environment. Any launcher guarding
with `[[ -z "$MINIMAX_API_KEY" ]]` accepts that placeholder over the real
125-character key in `~/.openclaw/openclaw.json`, and MiniMax answers:

    401 "Please carry the API secret key in the 'X-Api-Key' field of the request header"

That message blames the *header*, so the obvious fix (changing auth header style)
is the wrong one — verified by curling the endpoint with both `x-api-key` and
`Authorization: Bearer`, which **both return 200**. Always validate shape:
`sk-` prefix and length >= 40.

**2. Do not route the worker through `pi`.** Measured on this host, `pi` hangs
intermittently on a command that succeeded seconds earlier — four consecutive
45-second timeouts after a clean run, with and without `PI_OFFLINE`, with and
without tools. The direct endpoint answered every time in ~1.3s. `minimax-worker`
therefore calls `https://api.minimax.io/anthropic/v1/messages` directly.

The cost is no tool use: pass context with `--file` or on stdin and take text
back. That matches the standing guidance to prefer the direct API lane when the
worker only needs to return a patch, plan, or analysis.

    minimax-worker --smoke
    minimax-worker --file src/a.ts --file src/b.ts "Write the migration for X"
    git diff | minimax-worker "Review this diff for correctness"

**Rollout note:** any installer that provisions this lane must carry the same
shape validation. Checking only that the variable is non-empty reproduces the
exact failure above on every new machine.

## Retired MiniMax Start Gate

**Historical note. Do not use this lane.** `$MINIMAX_API_KEY` is
often unset in the shell even when the key exists — it lives in 1Password, not
the environment. Never conclude MiniMax is "not live" from an absent env var
alone. Retrieve it first:

```bash
op item list --format=json | python3 -c "
import json,sys
for i in json.load(sys.stdin):
    if 'minimax' in i.get('title','').lower():
        print(i['id'], i['title'], i['vault']['name'])
"
# Use the "Minimax Coding Plan API Key" item (AgentWritable or Clawdbot vault),
# NOT "Minimax API Key Audio" — that's a different product/key.
export MINIMAX_API_KEY="$(op item get <item-id> --vault <vault> --fields credential --reveal)"
```

Never print the retrieved key to stdout, logs, or chat — pipe it straight into
an env var or the request that needs it.

Before delegating, prove the selected lane is live:

```bash
# Qwen
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"

# Direct MiniMax API
curl -sS https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","thinking":{"type":"disabled"},"messages":[{"role":"user","content":"Reply with exactly: MINIMAX OK"}],"max_completion_tokens":20,"temperature":0}'

# MiniMax through Droid
~/.local/bin/droid exec --model minimax-m3 "Reply with exactly: MINIMAX OK"
```

If the smoke check fails, continue without that worker and report the lane as
installed but not live-verified.

## Start Gate

Before delegating, prove the Luna Max lane is configured and live. Do not print or copy API keys. For Factory Droid, use the configured custom model and maximum reasoning:

~~~bash
~/.local/bin/droid exec --model custom:gpt-5.6-luna-[VP]-0 --thinking max \\
  "Reply with exactly: DROID_LUNA_OK"
~~~

For Pi/Codex, verify the effective model is gpt-5.6-luna and the reasoning level is max before launching the worker. If Luna is unavailable, use the explicitly configured fallback lane and report that fallback honestly; never route silently to MiniMax or claim Luna execution without evidence.

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

## Standard Luna Max Invocation

```bash
mkdir -p .codex/beastmode-runs
run_dir=".codex/beastmode-runs/$(date -u +%Y%m%dT%H%M%SZ)-luna-max"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
You are the bounded Luna Max worker for a director-led Beastmode run.

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
~/.local/bin/droid exec --auto low --model custom:gpt-5.6-luna-[VP]-0 --thinking max -f "$run_dir/prompt.md" >"$run_dir/output.md" 2>&1
```

## Retired Qwen Invocation (historical only)

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

## Retired Direct MiniMax API Invocation (historical only)

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
node - "$run_dir/prompt.md" "$run_dir/output.md" <<'NODE'
const fs = require("fs");

const [promptPath, outputPath] = process.argv.slice(2);
const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  throw new Error("MINIMAX_API_KEY is required for the direct MiniMax API lane.");
}

const prompt = fs.readFileSync(promptPath, "utf8");
const response = await fetch("https://api.minimax.io/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.BEASTMODE_MINIMAX_MODEL || "MiniMax-M3",
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_completion_tokens: 4096,
  }),
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`MiniMax API ${response.status}: ${body.slice(0, 500)}`);
}
const parsed = JSON.parse(body);
fs.writeFileSync(outputPath, `${parsed.choices?.[0]?.message?.content || ""}\n`);
NODE
```

Direct API workers cannot inspect the worktree or run tools themselves. Ask for
patches, plans, or review findings, then have the director apply and verify.
Use `thinking.type: disabled` for exact-output smoke tests and cleaner worker
transcripts.

## Retired Droid MiniMax Invocation (historical only)

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
