# MemroOS Agent Directive Template
#
# This file is the SINGLE SOURCE OF TRUTH for what every agent should know
# about MemroOS. It is installed to every agent CLI's expected AGENTS.md
# location by `scripts/install-agent-integrations.sh` in the MemroOS repo.
#
# DO NOT edit the copy in your home directory. To change the canonical rule,
# edit THIS file in lac5q/memroos and re-run the installer. The installer
# is idempotent — running it again re-converges every target.
#
# Source: https://github.com/lac5q/memroos/blob/main/agents/AGENTS_TEMPLATE.md
# Installer: https://github.com/lac5q/memroos/blob/main/scripts/install-agent-integrations.sh

## MemroOS — Knowledge Store (PRIMARY)

All durable agent knowledge **must** be written to MemroOS via MCP. MemroOS is git-backed, owned, and portable. This is the canonical rule that applies to every agent in every context.

### Always Do

- **MUST use `mcp_memroos_knowledge_write`** when the user asks to save, file, document, archive, or store research, analysis, plans, reports, comparisons, benchmarks, RCAs, or any durable work product.
- **MUST use `mcp_memroos_knowledge_read`** to retrieve stored knowledge — never read `~/github/knowledge/` directly when the MCP is available.
- **MUST use `mcp_memroos_knowledge_search`** to discover what exists before writing duplicates.
- **MUST commit after writes** — MemroOS auto-commits, but verify with `mcp_memroos_knowledge_git_status` if unsure.
- **MUST include metadata in frontmatter** for any non-trivial artifact: `model`, `sources`, `derived_from`, `regen_prompt`. See the `memroos-save` skill for the schema.
- **MUST run the End-of-Task Persist Checklist** (below) before sending your final reply on any research/analysis task.

### Never Do

- NEVER skip `mcp_memroos_knowledge_write` for a comparison, RCA, benchmark, or research deliverable. Chat output is ephemeral; MemroOS is durable.
- NEVER leave durable work product only in session-scoped paths (`~/.hermes/hermes-agent/reports/`, `/tmp/`, Discord messages).
- NEVER write to `~/github/knowledge/` directly via `write_file` or shell when MemroOS MCP is available. Direct file I/O bypasses gatekeeper validation and audit logging.

## Where Class Lessons Live: Skills > Memory (operator directive 2026-07-09)

The user has explicitly directed that **durable memory for "how this class of work goes"** belongs in **skills**, not in MEMORY.md or persistent memory. Skills are git-backed, version-controlled, diff-able, and re-loadable across agents. Persistent memory is a per-session injected snippet with a hard char budget; it should never duplicate what a skill already says.

### Always Do

- **MUST encode class-level lessons (procedures, pitfalls, gotchas, "don't repeat this" corrections) into the relevant skill.** The skill's `SKILL.md` or a `references/*.md` under the skill is the durable home. Memo­ry never receives a lesson the skill can already explain.
- **MUST cite the skill in your reply** when invoking a skill, per the "Skill Check (MANDATORY)" rule.
- **MUST keep MEMORY.md lean.** Reserved for operator facts that are true across every session and that no skill would reasonably contain (user identity, family, global tool quirks, environment constants). If a memory entry points to a skill, the entry is correctly a one-line pointer — not a paragraph that duplicates the skill.
- **When you find yourself about to `memory.add` something that already lives in a skill, stop.** Drop the add, and instead verify the skill is up-to-date.

### Never Do

- NEVER persist a class lesson (procedure / framework / pitfall / "make sure you don't do X again" correction) to MEMORY.md if a skill file is the natural home. Persistent memory is finite and is for user-profile / environment facts.
- NEVER use `memory.add` as a substitute for fixing a skill. The right response to "I keep doing X wrong" is to update or create a skill — not to add a memory entry that says "don't do X."
- NEVER let MEMORY.md grow past ~50% of its char budget. If you're approaching the cap, the cure is to compress or remove, not to add.

### Correct Flow

```
Class lesson surfaces (a bug, a pitfall, a user correction, a "don't repeat this")
   ↓
Update the relevant skill (SKILL.md or references/*.md)
   ↓
(Only if it crosses sessions and is NOT a class lesson) → memory.add
   ↓
   ↓ (parallel — does NOT replace the skill update)
   ↓
mcp_memroos_knowledge_write (for full durable work product: RCAs, benchmarks, comparisons)
```

### Anti-pattern examples (rejected 2026-07-09)

- Adding `Podcast show-art 3000×3000 + Transistor upload pipeline` to MEMORY.md when the same recipe already exists in `content-publishing-os/references/...` — reject; the skill is the home.
- Adding `clarify() batching rule: one combined per batch, not N parallel` to MEMORY.md when `devops-service-operations` §consent-batching already encodes it — reject; the skill is the home.
- Adding `cross-model delegation has zero provenance` to MEMORY.md when `agent-operations/references/cross-model-delegation-provenance.md` already encodes it — reject; the skill is the home.
- A memory entry MAY be a one-line pointer like `cross-model delegation → agent-operations/references/cross-model-delegation-provenance.md`. A two-line rule with the same content as the skill is duplication.

### When memory IS the right home

- User identity: name, role, team, key relationships.
- Family / personal: daughter Maia, softball team rules, etc. (operator-curated).
- Environment: machine paths, OS quirks, tool creds locations.
- Stable preferences: voice default, profile selection, crosspost defaults.
- Cross-session invariants that no single skill would own.

Everything else: skill first, memroos second, memory last (and brief).

### End-of-Task Persist Checklist (mandatory for research/analysis work)

Before sending your final reply to the user on any task that produced research, competitive analysis, market positioning, comparison content, benchmark results, or root-cause analysis:

1. **Did I produce research?** (look for `## Comparison`, `## Benchmark`, `## RCA`, `## Analysis`, `## Recommendations` sections, or external sources cited)
2. **Did I call `mcp_memroos_knowledge_write` for it?** If not → call it now.
3. **Did I read it back to verify?** If not → call `mcp_memroos_knowledge_read`.
4. **Did I tell the user the path?** If not → include the path in your final reply.

If `mcp_memroos_knowledge_write` is not in your tool list (MCP unavailable):
- Use the fallback: direct file write to `<MEMROOS_ROOT>/content/<topic-slug>.md` → `git add` → commit with author `Alba [bot] <alba@memroos.dev>` → `git push origin main`
- Tell the user you used the fallback path

The daily cron `research-without-persist-detector` scans for sessions that produced research without `knowledge_write` — but the cron is the safety net, not the primary path. Do the checklist at end-of-task every time.

### Correct Flow

```
Agent → memroos MCP (mcp_memroos_knowledge_write, mcp_memroos_knowledge_read)
              ↓
       Knowledge base (git-backed markdown at MEMROOS_ROOT/content/)
```

### Fallback Flow (when MCP unavailable)

```
Agent → write_file(path="MEMROOS_ROOT/content/<slug>.md")
              ↓
       verify toplevel == MEMROOS_ROOT   ← MANDATORY, see below
              ↓
       git -C "$MEMROOS_ROOT" add <file> && git -C "$MEMROOS_ROOT" commit && git -C "$MEMROOS_ROOT" push
              ↓
       Knowledge base (git-backed markdown, persisted via git)
```

#### NEVER let knowledge git commands escape MEMROOS_ROOT

Bare `git add && git commit && git push` run from the knowledge directory **walks up the tree and silently operates on the nearest ancestor repository**. On at least one machine `$HOME` is itself a git repo, so the fallback above resolved to `/Users/<user>` — whose only remote was a **Heroku app** (`git.heroku.com/<app>.git`). A `git add -A && git push` there would have staged large parts of the home directory and pushed it to a deployed application.

**Always do this first — no exceptions:**

```bash
[ "$(git -C "$MEMROOS_ROOT" rev-parse --show-toplevel 2>/dev/null)" = "$MEMROOS_ROOT" ] || {
  echo "REFUSING: $MEMROOS_ROOT is not its own git repo (resolves elsewhere)"; exit 1; }
```

- **NEVER** use `git add -A` / `git add .` for knowledge writes. Stage the explicit file path you just wrote.
- **NEVER** `cd` into the knowledge dir and run bare git. Always `git -C "$MEMROOS_ROOT"`.
- If the check fails, **surface the blocker** — do not `git init`, do not push, do not improvise a different directory.

#### Knowledge stores must NEVER be backed by a Heroku app remote

MemroOS knowledge is documents, not a deploy target. A Heroku remote on a knowledge repo is always a misconfiguration and is treated as a hard stop.

- **NEVER** add, push to, or pull from a `git.heroku.com` / `heroku` remote from any knowledge repo or `MEMROOS_ROOT`.
- **NEVER** store knowledge content inside a directory whose repo has a Heroku remote — including any ancestor directory.
- **NEVER** connect MemroOS storage to a Heroku app, dyno filesystem, or Heroku-hosted database. Heroku dynos have ephemeral filesystems; content written there is destroyed on restart, which defeats the entire durability guarantee.
- Before the first write of a session, confirm the destination is clean:

```bash
git -C "$MEMROOS_ROOT" remote -v | grep -qi heroku && {
  echo "REFUSING: knowledge root has a Heroku remote"; exit 1; }
```

Knowledge remotes belong on the owned GitHub knowledge repo. If the only reachable remote is Heroku, **stop and report** rather than pushing.

### Why MCP-First?

- **Enforcement**: MemroOS validates paths, schema, and permissions
- **Auditability**: every read/write is logged with agent ID and timestamp to `~/.memroos/audit/knowledge-writes.jsonl`
- **Backend portability**: storage backend can change without touching agent code
- **Coordination**: many agents sharing one git repo need a gatekeeper to prevent clobbered writes
- **Governance**: MemroOS is the single source of truth for agent knowledge

## Automatic Downshift: Menial Work Goes to Luna Max (operator directive 2026-07-26)

Luis has directed, as a **permanent standing rule**, that menial work goes to a
Luna Max coworker rather than to the expensive director model. The current
agent stays director, reviewer, and merge gate; GPT-5.6 Luna is the bounded worker
and must run with maximum reasoning.

**This is automatic and dynamic. Luis never has to ask.** Downshifting is a
default posture, not a request-triggered behavior — there is no trigger phrase,
and waiting to be told is itself a violation of this rule. Classify every unit of
work at the moment you are about to start it, and re-classify continuously as the
work reveals its real shape. Do not ask permission to downshift and do not
announce the routing decision as a question; just route, then report what ran
where.

**Menial** means work that is mechanical, verifiable by inspection, and does not
require architectural judgment: bulk find/replace-shaped edits across many files,
boilerplate and scaffolding, test-fixture and mock generation, format/lint/type
cleanups, doc and comment tidying, log and output triage, changelog and release
notes from a known diff, data reshaping, and repetitive per-item passes over a
list the director already scoped.

**Not menial** — the director keeps these: architecture and design decisions,
security and auth changes, anything touching secrets or credentials, impact
analysis and blast-radius calls, final verification and truth claims, planning
documents, commits, pushes, and merges.

### Dispatch Test (run this before starting any unit of work)

Ask, in order:

1. Is the outcome checkable by inspection or by a command, without judgment about
   whether it was the *right* thing to do? → menial.
2. Did the director already decide the approach, leaving only execution? → menial.
3. Is it the same operation repeated over a list? → menial, one worker per item or
   one bounded batch.
4. Would getting it wrong cost only a re-run, not a bad decision? → menial.

Any "no" that involves design, security, or a truth claim keeps it with the
director. When genuinely ambiguous, downshift with a tighter scope and review the
result — a cheap attempt plus director review beats director-inline execution.

### Dynamic Re-classification (mid-flight, both directions)

- A task that turns out to be mechanical **downshifts mid-flight** — hand the
  remainder to the worker instead of finishing it inline out of momentum.
- A "menial" task that surfaces a design, security, or correctness question
  **escalates back to the director immediately**; do not let the worker decide it.
- A long task decomposes: route the mechanical slices down and keep only the
  judgment slices. Prefer many bounded worker slices over one director pass.

### Always Do

- **MUST run the dispatch test unprompted** on every unit of work, and route
  accordingly, without being asked and without asking.
- **MUST route menial work to the Luna Max lane** when it is live. Lane table,
  invocation, and smoke gates: `docs/codex-cloud/skills/beastmode-cloud/SKILL.md`.
  Use `gpt-5.6-luna` through the configured OpenAI Codex provider, or Factory
  Droid's `custom:gpt-5.6-luna-[VP]-0` when tool access is required.
- **MUST use maximum reasoning** for Luna Max worker calls and verify the
  effective model/reasoning settings before delegating.
- **MUST hand the worker a bounded slice**: scope, allowed files, acceptance
  checks, and blast-radius notes written by the director first.
- **MUST review everything the worker returns** and run the real checks yourself
  before applying it. The worker's claim of success is not evidence.
- **MUST fall back explicitly** when Luna Max is unavailable: use the next
  configured worker lane, then the cheapest available subagent, then
  director-inline as the last resort. Never claim Luna execution when it did
  not run.
- **MUST state which lane actually ran** in the final report — name the fallback
  rather than implying Luna Max ran.

### Never Do

- NEVER wait for Luis to say "delegate this" or "use Luna." The routing decision
  is yours, every time, silently.
- NEVER ask permission to downshift, and never offer downshifting as an option to
  choose. Route first; report after.
- NEVER let the worker commit, push, access secrets, or make final verification
  claims.
- NEVER spend director tokens on a mechanical pass a bounded worker could do,
  when the Luna Max lane is live.
- NEVER delegate architecture, security, impact analysis, or planning judgment to
  the menial lane.
- NEVER report work as Luna Max-executed when it was not.

## MemroOS vs Artyfacts

Artyfacts is a third-party filing-cabinet MCP server (28 tools, plugin name `artyfacts`, serverName `artyfacts`). It is **deprecated for knowledge storage** in this stack — MemroOS is primary.

When to use which:
- **Use MemroOS** for personal/team knowledge, code-adjacent research, anything you want git-backed and ownable.
- **Use Artyfacts** only for client deliverables that need sharing/regeneration primitives MemroOS doesn't yet expose (public share links, named-collaborator invites, per-section regeneration, source-drift detection).

Artyfacts trigger words (so you know what NOT to call): `save_document_as_artifact`, `start_section`, `update_section`, `share_artifact_with_user`. Artyfacts auth: WorkOS OAuth (one-time `/mcp` sign-in).

## MemroOS MCP Registration

The MemroOS MCP server is registered automatically by `scripts/install-agent-integrations.sh` from the MemroOS repo. Standard registration:

```yaml
mcp_servers:
  memroos:
    command: /bin/bash
    args:
      - -lc
      - exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"
    connect_timeout: 30
    timeout: 60
```

If `mcp_memroos_*` tools are missing from your tool list, run the installer:
```bash
bash "$HOME/github/memroos/scripts/install-agent-integrations.sh"
```

It is idempotent — running it again re-converges every target.

## MemroOS Skills

The `memroos-save` skill (canonical location: `lac5q/memroos/.agents/skills/memroos-save/SKILL.md`) is installed alongside this directive. Load it with:

- Claude Code / Cursor / ZCode / OpenCode: auto-loaded on first save/document request
- Hermes / OpenClaw: explicit `skill_view(name="memroos-save")`
- Codex: load via `/skills`

## Reporting problems to MemroOS

When a MemroOS tool, authentication path, or service itself breaks, use the
standing MCP `report_issue` channel with a concise title, reproduction details,
severity, and component. Do not include credentials, bearer tokens, API keys,
or raw secret-bearing responses. If MCP is unavailable, leave a secret-free
Markdown report in `.health/bug-reports/` as the last resort.

## How To Update This Directive

1. Edit `agents/AGENTS_TEMPLATE.md` in `lac5q/memroos`
2. Commit and push to `lac5q/memroos main`
3. Re-run the installer on each machine: `bash $HOME/github/memroos/scripts/install-agent-integrations.sh`
4. Or wait — `scripts/install-agent-integrations.sh` is also callable from cron (`scripts/cron-reinstall-agent-integrations.sh` weekly) to auto-rollout.

The canonical rule will never go stale.

## Dev Server Logs (When Debugging a Running Repo)

When a repo has a long-running dev server (Next, Vite, Rails, Django, Phoenix, FastAPI, etc.), agents debug by reading the log, not by owning the process. Convention:

- Dev server runs as `dev:log` (writes to `logs/dev.log`, truncated per run)
- Sidecars / workers: `logs/<service>.log`
- `logs/` is gitignored
- Agents must check `logs/dev.log` before starting their own dev server
- Independent of RTK. RTK's `[tee]` is failure-only and unrelated

Full reference (load on demand): `~/github/knowledge/content/devops/dev-log-convention-2026-07-06.md`
Wrapper script: `~/github/knowledge/scripts/dev-log.sh`

## Writing quality (all agents)

Technical and operator prose uses ASD-STE100 Simplified Technical English unless the user asks for another voice (marketing copy, fiction, quotes, or code identifiers stay as-is).

Follow Zinsser's four principles: simplicity, brevity, clarity, humanity.

Before shipping prose, scan `FORBIDDEN.md` next to this file (staccato pairs, antithesis reframes, isocolon metaphor-pairs, backward-references). Rewrite hits; do not ship them.

Long-form / writer tasks: keep the active context under 50%. Spawn a subagent or trim context when it climbs past that, or quality drops.

Load official `no-ai-slop` when polishing drafts (see `agents/OFFICIAL_SKILLS.md`). Prefer the installed skill over inventing a new style guide.

## Build efficiency (Ponytail)

When building or changing code, prefer the official `ponytail` ladder after you understand the real flow: skip speculative work, reuse in-repo helpers, prefer stdlib and native features, avoid new dependencies, ship the shortest correct diff in the right place.

Bug fixes go to the shared root cause, not only the reported call path.

Default output: code first, then at most three short lines on what was skipped and when to add it. Load the `ponytail` skill for the full ladder and intensity levels. Default **full**; on Claude/Opus never default **ultra** (ultra only on explicit ask). Off for architecture, security design, and long planning. Off only on `stop ponytail` / `normal mode` for implementation sessions.

Never simplify away trust-boundary validation, data-loss error handling, security, accessibility basics, or anything the user explicitly requested.

Official approved skills: `memroos-save`, `memroos-recall`, `ponytail`, `no-ai-slop` (`agents/OFFICIAL_SKILLS.md`).

## Outbound Actions (Operator Directive)

Every agent acts on behalf of the user, but the user is the gateway for things that leave the machine. "File the form", "queue the post", "draft the response" — none of these imply "send."

### Always Do

- **MUST ask for an explicit GO before any outbound action** that posts, sends, uploads, tags, DMs, comments, publishes, or otherwise transmits the work to a third party. The user's "GO" is the only valid trigger.
- **MUST show the user the exact payload** (channel, target, content) before asking for GO. Don't ask "ready to send?" without showing what would be sent.
- **MUST confirm the channel/target ID** the user provided. If no target was given, ask — don't synthesise a plausible chat ID, topic, or handle.

### Never Do

- NEVER post, send, upload, tag, DM, comment, publish, retweet, or otherwise transmit anything outbound as a side effect of completion. Finishing the prep work is not permission to fire it.
- NEVER push to the default branch without explicit "ship it" / equivalent. Checkout, commit, and PR are fine; the user is the merge gate.
- NEVER invent private channel IDs, topic IDs, chat handles, repos, file paths, or URLs. If the user didn't provide it, ask; do not plausibly construct one.
- NEVER treat a `cron` delivery option (`origin`, `local`, `all`, `platform:chat_id`) as authorization to send. The user defines time + target; the agent only fills the body.

### Boundary Examples

- "Draft the LinkedIn post" → write the draft, show it, ask "say GO and I push" — do not auto-publish.
- "Queue the Discord thread" → prepare the thread, return the JSON, wait for GO — do not auto-post.
- "Open the PR" → make the branch and PR (commit is local), stop. The user pushes and merges.

## GitNexus Code Intelligence (operator directive 2026-08-04)

Every GitHub project an agent works on, on every machine, must have a current GitNexus
index before non-trivial code work starts. The index is what makes `impact`,
`detect_changes`, and `query` answer truthfully; without it, blast-radius claims are
guesses.

### Always Do

- **At session start in any git repo**, check the index: `gitnexus status` (or the
  `gitnexus://repo/<name>/context` MCP resource). Missing or stale → run
  `node .gitnexus/run.cjs analyze` from the project root, else `gitnexus analyze`,
  else `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`).
- **Index the canonical checkout**, not a worktree; pass the worktree path to
  `detect_changes` when editing from one.
- **Run `detect_changes` before committing** and `impact` before editing hot symbols,
  per the repo CLAUDE.md rules.

### Never Do

- NEVER report "GitNexus unavailable" without first attempting the analyze commands above.
- NEVER treat a sibling repo's index (e.g. public `memroos` vs private `memroos-product`)
  as coverage for the repo you are editing — index the repo you are in.

## Source

- Repo: https://github.com/lac5q/memroos
- Template: https://github.com/lac5q/memroos/blob/main/agents/AGENTS_TEMPLATE.md
- Installer: https://github.com/lac5q/memroos/blob/main/scripts/install-agent-integrations.sh
- RCA for the original failure mode this prevents: `content/research/memroos-persist-failure-rca-2026-07-05.md`
