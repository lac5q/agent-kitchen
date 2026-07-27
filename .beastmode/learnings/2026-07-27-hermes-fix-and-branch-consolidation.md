## BM-20260727 hermes-completion-branch-consolidation

- Director/Lead: Claude Sonnet 5 (high), this session
- Watcher/Reviewer: pending — Opus 5 (high), final diff review before push
- Executor: none yet delegated; all work done directly by director (conflict
  resolution requires judgment, not mechanical execution — see below)
- Harness: manual git workflow (no Ultraswarm/GSD in play for this run)

### What happened

1. **Recovered stranded work.** The user's prior "fix cordant-hermes-01"
   session had run in the wrong checkout — uncommitted changes
   (`instrumentation.ts` connector-job wiring, `scripts/memroos-env-gaps.sh`)
   were sitting in the main checkout (`/Users/lcalderon/github/memroos`), not
   the worktree the new session started in
   (`.claude/worktrees/memroos-hermes-completion-d3be6e`, which was clean and
   identical to `main`). Lesson: uncommitted work does not travel between
   worktrees — always check `git worktree list` + `git status` in every
   checkout before concluding work is lost.
2. **Scope grew from "finish the Hermes fix" to "merge everything into main
   and clean up branches"** after inventorying the repo turned up 7 orphaned
   branches (each with exactly one commit, 195–267 commits behind main) plus
   a real uncommitted stash on `fix/hil-sla-flood-ui`.
3. **Merged all 8 items** (Hermes fix + 7 branches + stash recovery attempt).
   Two branches produced real merge conflicts; both required reading current
   code (`route.ts`, current `pulse-strip.tsx` structure) to determine which
   side was still correct after 200+ commits of drift — this is judgment
   work, not mechanical work, and stayed with the director per beastmode's
   own routing rule (verification here was not cheap/objective).
4. **The stash was already superseded.** `fix/hil-sla-flood-ui`'s "unfinished"
   stash (escalations pagination) turned out to already be shipped in main
   via a different route (`origin/fix/hil-sla-flood-ui` was already an
   ancestor of `main`). Recovering it as new work would have been wasted
   effort; the check (`merge-base --is-ancestor`) took one command.
5. **A merged branch reintroduced a regression.** `fix/test-suite-cleanup`
   was 232 commits stale and tried to fix the same macOS `/private/var` vs
   `/var` symlink flake that main had already fixed independently and
   differently (commit `4c3efe67`, by making the *test* resolve realpaths,
   vs. the branch's approach of stripping `/private` in `paths.ts`). Merging
   both fixes together broke 5 tests. Caught by running the full suite after
   all merges, not just per-branch smoke tests — **the real regression
   surfaced only when everything was combined**, which per-branch testing
   would have missed since each branch tested clean in isolation against a
   different baseline.

### Routing / lane failure

- MiniMax (both `$MINIMAX_API_KEY` env var and `droid exec --model
  minimax-m3`) initially reported not-live. **This was a false negative**:
  the key exists in 1Password (`Minimax Coding Plan API Key`, AgentWritable /
  Clawdbot vaults) but was never exported to the shell. Fell back to Qwen per
  the standing downshift rule, which the operator explicitly corrected —
  1Password must be checked before any lane is declared unavailable.
- Fix applied: `docs/codex-cloud/skills/beastmode-cloud/SKILL.md` Start Gate
  section now documents the `op item list` lookup and the exact item name to
  use (there are two similarly-named Minimax items; the Audio one is wrong
  for this lane).
- Routing rule to change: **always check 1Password before reporting any
  worker lane as unavailable**, not just for MiniMax. Promoted into the skill
  directly (see above) rather than left as a one-off memory note, per the
  skills > memory precedent this repo already follows.

### Result

- Result: pass (pending final full-suite re-run + Opus validator pass +
  branch cleanup, in progress when this entry was written)
- Token/cost note: no Workflow/subagent spend yet — all conflict resolution
  done inline by the director; MiniMax/Qwen not actually invoked for
  execution this run (the work available was judgment-shaped, not
  mechanical-shaped, once branches were this stale)
- What worked: `git merge-base --is-ancestor` to detect an already-superseded
  stash before wasting effort recovering it; reading the *original* narrow
  diff (`git diff <merge-base> <branch> -- <file>`) instead of the noisy full
  merge-conflict diff, to recover intent when a conflict looks unrecognizable
  after heavy drift
- What failed / drifted: declared MiniMax unavailable without checking
  1Password first; staged unrelated stray WIP files with an incautious
  `git add -A` mid-merge (caught and unstaged before committing)
- Skill/config update needed: yes — done (beastmode-cloud Start Gate)
