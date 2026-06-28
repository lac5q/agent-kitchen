---
name: qwen-cloud
description: Delegate a bounded Codex Cloud task to the Qwen executor CLI installed by scripts/setup-codex-cloud.sh.
---

# Qwen Cloud Executor

Use this skill when Luis asks to use Qwen from Codex Cloud, especially for
bounded research, mechanical edits, test writing, docs, or parallel exploration.

Qwen is an external executor in Codex Cloud. Codex remains responsible for
planning, secrets hygiene, review, verification, and any final file changes.

## Requirements

- `~/.local/bin/qwen-agent` exists.
- `DASHSCOPE_API_KEY` is available to the agent phase, or stored at
  `~/.qwen/settings.json` as `{"env":{"DASHSCOPE_API_KEY":"..."}}`.
- Default model: `qwen3.7-plus`.
- Provider endpoint:
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.

Do not use `BAILIAN_CODING_PLAN_API_KEY` for headless cloud tasks. The local
wrapper uses the DashScope Standard OpenAI-compatible endpoint.

## Smoke Check

Before claiming the Qwen lane works in a new cloud environment, run:

```bash
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

Expected output:

```text
QWEN OK
```

If the key is unavailable, say the Qwen lane is installed but not live-verified.

## Delegation Pattern

1. Write a short acceptance contract: task, allowed files, disallowed actions,
   verification command, and required output format.
2. Save Qwen output under `.codex/qwen-runs/<timestamp>/` unless the user asked
   for a different artifact path.
3. Prefer asking Qwen for a patch, analysis, or explicit command transcript.
4. Review Qwen output before applying changes.
5. Run the repo's verification commands yourself after applying any Qwen work.

## Command

```bash
mkdir -p .codex/qwen-runs
run_dir=".codex/qwen-runs/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$run_dir"
cat >"$run_dir/prompt.md" <<'EOF'
TASK:
<bounded task>

ALLOWED FILES:
<paths>

DO NOT:
- Read or print secrets.
- Send network requests except package/doc lookups needed for the task.
- Commit, push, delete, or publish anything.

OUTPUT:
- Concise findings or a unified diff.
- Verification commands run or recommended.
EOF
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "$(cat "$run_dir/prompt.md")" >"$run_dir/output.md" 2>&1
```

## Safety

- Never pass broad secrets, personal data, private financial/legal material, or
  production credentials to Qwen.
- Sanitize prompts if Qwen blocks sensitive audit or infrastructure text.
- Do not merge Qwen output without Codex review and local verification.
- If Qwen modifies files directly, inspect `git diff` before continuing.
