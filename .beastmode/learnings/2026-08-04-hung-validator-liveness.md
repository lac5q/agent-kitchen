# BM-20260804 hung-validator → liveness contract

- Director: claude-fable-5 (Claude Code session)
- Watcher/Validator: codex gpt-5.6-sol high (operator-selected)
- Executor: codex gpt-5.6-luna max (operator-selected)
- Harness: claude-code adapter, codex exec lanes
- Result: partial — validator lane hung 3x before root cause found
- What failed: three consecutive sol dispatches with a ~1.4KB inline prompt hung at startup —
  zero CPU, no `~/.codex/sessions` rollout, empty stdout — one for ~4h before detection.
  Meanwhile every short-prompt dispatch (smokes, `-C` worktree diagnostic) succeeded, and
  hung processes wedged same-lane retries until killed. Unbounded `until` watcher loops
  orphaned on the user's task list ("running for hours") when their conditions became
  impossible.
- What worked: file-pointer dispatch ("Read the file X and follow it exactly") +
  `BM-RUN:` marker + bounded startup probe → STARTUP-CONFIRMED in under a minute.
  Kill → smoke-after-kill → re-dispatch ladder.
- Routing rule changed: liveness contract promoted into skills (operator-approved 2026-08-04):
  `beastmode/SKILL.md` ACN rule 8, `beastmode/references/child-liveness.md` (new),
  `beastmode-claude-code/SKILL.md` § "Child liveness in this harness".
- Operator rules recorded: never kill a child showing progress without asking; second
  consecutive hang on a lane goes to the operator with substitution options.
