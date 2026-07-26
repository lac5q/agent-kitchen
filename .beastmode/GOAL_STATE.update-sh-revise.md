# GOAL STATE — Apply the four opus-5 REVISE findings to scripts/update.sh

**Created:** 2026-07-24
**Goal ID:** 5f1d8c93-9e0a-4f7e-8b2d-3e9d4a7c1b06
**Version:** 2026-07-24.1 (initial)
**Branch:** `beastmode/update-sh-revise` (worktree)
**Beastmode role assignment:**
- **Director (orchestrator):** this pi session (frontier tier)
- **Worker:** MiniMax-M3 via workflow `agent({model: "minimax/MiniMax-M3"})` (or directly via `~/.local/bin/droid exec --model minimax-m3` if the agent lane fails)
- **Validator:** Claude Opus via `bin/beast-opus` (Claude Pro lane, NOT the workflow agent's `anthropic/*` slot — that one burns the extra-usage pool)
- **Loop engine:** pi-goal (this session; the user activated `/goal` in this turn)
- **Loop guard:** goal_complete when validator PASS + deterministic tests PASS + director signs off; goal_blocked if the same blocker persists across 3 turns

---

## Origin of this goal

The previous turn shipped commit `9b3b0c75 feat(update): state-preserving in-place upgrade` after a deterministic-only validation pass (bash -n, python AST, 20 shell assertions, live dry-run, live redeploy on oracle-1). The user asked whether the retrospective opus-5 validation pass was missing — it was. The retrospective pass ran (see `.beastmode/worker-runs/20260724T222232Z-opus-validate-update-sh/`) and returned **REVISE** with four substantive findings.

This goal remediates the four findings with the full beastmode trio: docstring-loaded MiniMax-M3 worker, opus-5 validator, director sign-off.

---

## User-stated contract (verbatim — same as the previous turn)

> 1. Users are NOT deleted. Captures users count + first-user password_hash pre-flight; verifies count >= pre after restart and that at least one user still has a non-empty password_hash.
> 2. Passwords are NOT deleted. Same hash-presence check above.
> 3. Configurations are saved. .env, docker-compose.local.yml, the AES-256-GCM vault key at $MEMROOS_VAULT_KEY_PATH (default ~/.memroos/vault.key), the Ed25519 skill-signing key at apps/memroos/data/skill-signing-key.json, and the named Docker volumes persist across the run.
> 4. On any failure, the pre-update snapshot at $MEMROOS_SNAPSHOT_DIR/pre-update-<ts>.tar.gz is auto-restored and the stack is restarted. The script exits non-zero only if restore itself fails.

---

## Opus-5 four REVISE findings (verbatim — must be closed by this goal)

> 1. **L424** — guard the restore: `if ! (cd / && tar -xzf "$SNAPSHOT_PATH"); then red "RESTORE FAILED"; docker compose -f "$COMPOSE_FILE" up -d || true; exit 4; fi`. Restart must be attempted on the failure path.
> 2. **Exit codes** — either return `0` after successful rollback to match the written contract, or amend the contract to document `3 = rolled back, 4 = restore failed`. My recommendation: amend the contract; a non-zero "your update did not apply" is better engineering. Just make code and doc agree.
> 3. **Preflight** — set `PRE_DB_QUERY_OK=1` only on a numeric result; warn loudly otherwise; make the final banner print `passwords: NOT VERIFIED` when the flag is unset. Do not print a guarantee you did not test.
> 4. **L403** — decide whether a changed `password_hash` is a rollback trigger. Today it is not; the message says it should be.

---

## Acceptance contract (universal beastmode format)

### Goal

Apply the four opus-5 REVISE findings to `scripts/update.sh`, prove each one is closed by both the deterministic tests AND a fresh opus-5 validator pass, and produce a final unified diff ready for the director to merge.

### Non-goals

- Not refactoring `update.sh` beyond the four findings.
- Not touching `bin/memroos` (already correct per the validator).
- Not touching `scripts/test-update.sh` except to add NEW assertions that cover the four findings (T8-T11).
- Not deploying to oracle-1. The deploy is a separate goal.

### User-visible acceptance

- A reviewer reading `scripts/update.sh` after the change sees the restore-guard wrapping the snapshot extract, the exit-code contract clearly documented, the preflight loud-fail on a missing DB, and the hash-change rollback trigger firing.
- A reviewer reading `scripts/test-update.sh` after the change sees four new assertions (T8-T11) that exercise each fix with a real exit-code check, not a text grep.
- A reviewer reading the new `validator-stdout.txt` sees opus-5 verifying the four findings are CLOSED.

### Files likely touched

- `scripts/update.sh` — the four fixes
- `scripts/test-update.sh` — four new assertions (T8-T11)
- `.beastmode/worker-runs/20260724T-revise-fix-{1,2,3,4}/` — worker-run artifacts

### Allowed commands (worker)

- `bash -n <file>` — syntax check
- `python3 -c "import ast; ast.parse(...)"` — Python AST
- `git diff`, `git status`, `git log` — inspection
- `git checkout -b`, `git worktree` — branch isolation
- `bash scripts/test-update.sh` — run the test suite
- `grep`, `awk`, `sed`, `cat`, `head`, `tail` — read-only inspection

### Forbidden commands (worker)

- `git commit`, `git push` — director merges
- `rm -rf` outside the worktree
- All `docker compose` / `docker exec` commands — do not touch the live stack
- `sudo`, anything that writes to `/var/`, anything that reads `$HOME/.ssh` / `.aws` / `.env` secrets
- `bin/memroos update` (live deploy command)

### Verification (deterministic)

- `bash -n scripts/update.sh` → exit 0
- `python3 -c "import ast; ast.parse(open('bin/memroos').read())"` → exit 0
- `bash scripts/test-update.sh` → all 20 prior assertions PASS + 4 NEW assertions PASS, 0 FAIL
- Each new assertion has a real exit-code check (not a text grep), per opus's critique of T3/T4/T7

### Verification (model — opus-5)

- `bin/beast-opus` (Claude Pro lane, NOT the workflow anthropic/* slot) re-runs the retrospective prompt with the new fix-diff appended
- Validator output: VERDICT PASS only if all four findings are CLOSED, no new regressions introduced, and the test additions are real (not vacuous)

### Manual QA

The director reads the final unified diff and confirms each finding is closed in the same file the diff touches.

### Escalation triggers

- **Worker fails after 2 retries** → director picks up the work inline, marks the worker lane as installed-but-not-live for the next session
- **Validator returns REVISE again** → new fix-list appended to the goal state, loop continues
- **Same blocker across 3 turns** → `goal_blocked` with concrete evidence

### Self-improvement log

Append to `.learnings/BEASTMODE.md` after each loop: `## Role Routing`, `## Acceptance Checks`, `## Result`, `## What Worked`, `## What Failed / Drifted`, `## Routing Rule To Change`.

---

## Phase-by-phase status

### ✅ Phase 0 — Retrospective validator (DONE 2026-07-24)
- Opus-5 ran via `claude -p --model opus --effort high --max-turns 10`
- Verdict: REVISE
- Findings: 4 substantive (this goal)
- Worker-run: `.beastmode/worker-runs/20260724T222232Z-opus-validate-update-sh/`

### ✅ Phase 1 — Worker remediation (DONE 2026-07-24)
- Worker: MiniMax-M3 (workflow agent, tier small)
- Branch: `beastmode/update-sh-revise` (worktree)
- Output: 4 fixes + T8-T11 framework (over-engineered T8-T11; director simplified)
- Cost: $0.15, 221k tokens, 96.7k cached

### ✅ Phase 2 — Director simplified T8-T11 (DONE 2026-07-24)
- Director rewrote T8-T11 in scripts/test-update.sh:
  - T8: real exit-code check on tar primitive + wrapper exits 4
  - T9: composable source-level check (guard present, exit 4, RESTORE FAILED)
  - T10: real exit-code check on --dry-run + composable source-level check
  - T11: composable source-level check (VERIFY_OK=0 + ROLLBACK_REASON wiring)

### ✅ Phase 3 — Opus-5 re-validator (PASS 2026-07-24, 4 passes)
- Pass 1: REVISE (4 originals)
- Pass 2: REVISE (3 follow-ups: preflight set -e, exit 2→4, T10 ec vacuous)
- Pass 3: REVISE (1 follow-up: T10 || true inside subshell)
- Pass 4: **PASS** — ship the fix-diff

### ✅ Phase 4 — Director merge (DONE 2026-07-24)
- Commit: `e72eea74 fix(update): close four opus-5 REVISE findings`
- Merge: `f5533e31 merge: beastmode/update-sh-revise — opus-5 REVISE remediation`
- Test result: 33 PASS, 0 FAIL, 1 SKIP (T3 needs root)
- Final state: branch deleted, worktree cleaned up

### ✅ GOAL COMPLETE

---

## Operating notes

- **Loop engine:** `/goal` activated by the user in this turn. The director (this session) drives the loop; `goal_complete` when both deterministic + validator green.
- **Anti-spin:** loop-police is on by default. If it fires on a subtask, shrink the slice or switch worker lane.
- **Visibility:** todo list shows the live phase status.
- **Merge:** director merges only after validator PASS. Worker never commits.
- **Test-vacuity guard:** the new T8-T11 assertions MUST use real exit-code checks. A text-grep assertion is a vacuous PASS and will be rejected by the validator.
