# agent-kitchen — DEPRECATED

**agent-kitchen** was the original name for the MemroOS workspace at `lac5q/memroos`. The `agent-kitchen` directory alias predates the MemroOS rename and continues to exist as a git worktree pointing to the same `lac5q/memroos` repo.

**There is no separate agent-kitchen codebase.** It is the same repo as MemroOS.

## What to use instead

| Old name | New name | Source |
|---|---|---|
| `agent-kitchen` directory | `memroos` directory | `lac5q/memroos` |
| `~/github/agent-knowledge/rules-distributor.py` | `scripts/install-agent-integrations.sh` | `lac5q/memroos` |
| `RULES_SOURCE.md` + per-target copy | `agents/AGENTS_TEMPLATE.md` (single source) | `lac5q/memroos` |
| `memroos-save` skill (in skill-runtimes) | `memroos-save` skill (in `.agents/skills/`) | `lac5q/memroos` |

## How to migrate

If you have a system using the old names, do this:

```bash
# 1. Update your directory alias (if any)
rm -rf ~/github/agent-kitchen  # It's a worktree — recreate from memroos
cd ~/github/memroos && git worktree add ~/github/agent-kitchen main  # optional, just an alias

# 2. Re-wire everything to the canonical installer
bash ~/github/memroos/scripts/install-agent-integrations.sh

# 3. Verify
bash ~/github/memroos/scripts/verify-agent-integrations.sh
```

The new installer replaces `rules-distributor.py`, `apply-rules.sh`, `install-agents-md.sh`, and any other per-host fixup scripts. One file, one pass, idempotent.

## Why deprecated

- `agent-kitchen` and `memroos` referred to the same code. The distinction was a workspace directory alias, not a logical boundary.
- Maintaining two install paths (one for the kitchen, one for memroos) caused exactly the kind of drift we just fixed (canonical rule desync across agent CLIs).
- The name `agent-kitchen` doesn't appear in product, docs, or onboarding. It only existed as a directory alias on one developer's machine.

## What if I'm still using the old path?

The canonical installer (`scripts/install-agent-integrations.sh`) detects the canonical repo at `$MEMROOS_ROOT` (defaults to `$HOME/github/memroos`). If you prefer the alias, set:

```bash
export MEMROOS_ROOT="$HOME/github/agent-kitchen"
bash $MEMROOS_ROOT/scripts/install-agent-integrations.sh
```

It will work either way because the repo contents are identical.

## Source

This file lives at `lac5q/memroos/agents/DEPRECATION.md`. The fact that it ships in `agents/` rather than `docs/` is deliberate — every agent that loads AGENTS_TEMPLATE.md sees this too, so they understand the deprecation context.