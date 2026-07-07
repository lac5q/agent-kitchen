---
title: "MemClaw vs. MemroOS — Feature Gap Analysis (GSD Roadmap Input)"
description: "Side-by-side feature comparison of MemClaw (Felo-Inc persistent project memory for AI agents) and MemroOS (governed memory OS for agentic teams). Identifies 6 MemClaw UX patterns MemroOS should adopt, 9 governance features MemroOS already surpasses MemClaw at, and proposes v8.4 Project-Centric Operator UX (Phases 137-141) to close the operator-day-1 gap."
publishedAt: "2026-07-07"
tags: ["comparison", "memroos", "memclaw", "felo", "agent-memory", "persistence", "project-isolation", "gsd", "roadmap", "v8.4"]
keywords: ["memclaw vs memroos", "memclaw features", "felo memclaw", "agent project memory", "project isolation", "workspace", "is_shared", "document directory", "write rules"]
author: "Alba [bot]"
model: "minimax/MiniMax-M3"
sources:
  - "https://github.com/Felo-Inc/memclaw"
  - "https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/SKILL.md"
  - "https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/clawhub.json"
  - "https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/scripts/run.mjs"
  - "https://memclaw.me/en"
  - "https://memclaw.me/en/claw/install"
derived_from:
  - "~/github/memroos/.planning/ROADMAP.md"
  - "~/github/memroos/.planning/research/FEATURES.md"
  - "~/github/memroos/.planning/REQUIREMENTS.md"
regen_prompt: "Re-derive the comparison by reading Felo-Inc/memclaw SKILL.md and run.mjs from raw.githubusercontent.com, then comparing each command/concept against MemroOS phases 74-136 in .planning/ROADMAP.md. Update the proposed phases if any have shipped."
---

# MemClaw vs. MemroOS — Feature Gap Analysis

**Researched:** 2026-07-07
**Mode:** Subsequent research — competitor comparison for GSD roadmap input
**Status:** CANDIDATE backlog input for v8.4+ roadmap discussion
**Pipeline:** MiniMax-M3 (Alba) primary author with GLM 5.2 (zai provider, https://api.z.ai) as thinker pass and Codex 0.142.5 (codex-cli) as validator pass. Initial config state lacked the `zai` provider and `GLM_API_KEY`; both were restored mid-session from `~/.hermes/config.yaml.pre-global-glm52-20260630-102053.bak` and from chat-supplied credentials before the thinker pass ran (see Models Used §).

## TL;DR

| Aspect | MemClaw | MemroOS |
|---|---|---|
| **Core model** | Single 34 KB Node CLI over Felo API (hosted LiveDocs) | Self-hosted multi-service stack (Next.js + FastMCP + FastAPI + Python) |
| **Project isolation** | Workspace = 1:1 LiveDoc, `is_shared: true` makes it read-only | Spaces (TEAMSCALE-01..02, planned v8.2), MEMSEC labels, RBAC |
| **Storage** | Felo hosted, single 34 KB CLI; no self-host | Local Qdrant + Neo4j + SQLite + raw vault; self-hostable |
| **Auth** | Felo API key (paid dependency) | MEMROOS_AGENT_API_KEY, local; OAuth optional |
| **Cost** | Free to use MemClaw, but Felo API is paid | Zero paid services (standing gate) |
| **MCP tools** | 1 CLI script with 20 documented subcommands + 4 task commands (24 actions total) | 6 knowledge MCP tools + 18+ agent APIs + FastMCP |
| **Agent lifecycle** | "Load workspace" → context-packet binding; README is the agent's memory | Agent Context Packet (Phase 132) + run ledger; richer |
| **Governance** | None (no labels, no audit, no policy plane) | MEMSEC, BELIEF (bronze/silver/gold), hash-chained audit, POLGOV (planned) |
| **Plugin targets** | Claude Code, OpenClaw, Manual | GSDSTACK-10/11 (planned v8.3) — same target list, more constrained |
| **Web dashboard** | `felo.ai/livedoc/{short_id}` (hosted) | Next.js operator console at `memroos.epiloguecapital.com` (self-host) |
| **Best for** | Solo consultant / researcher / multi-project dev who wants zero-setup, free tier | Agentic teams scaling to ~100, regulated industries, governance-required |

**Bottom line:** MemroOS is a much heavier, more governable system. MemClaw ships 6 specific UX patterns today that MemroOS should adopt — none of them conflict with the standing gates. The recommended action is **v8.4 Project-Centric Operator UX (Phases 137-141)**.

---

## Source Artifacts

- MemClaw repo: https://github.com/Felo-Inc/memclaw (31 commits, 1 release, MIT)
- MemClaw SKILL.md: https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/SKILL.md (24 KB)
- MemClaw run.mjs: https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/scripts/run.mjs (34 KB single CLI script — primary source for the CRUD Surface inventory and task command enumeration)
- MemClaw clawhub.json: https://raw.githubusercontent.com/Felo-Inc/memclaw/main/memclaw/clawhub.json
- MemClaw site: https://memclaw.me/en (canonical, returns 200; bare /memclaw.me redirects to /en)
- MemClaw install guide: https://memclaw.me/en/claw/install
- Reference: MemroOS `.planning/ROADMAP.md` v8.0-v8.3 (Phases 120-136), `.planning/REQUIREMENTS.md`, `.planning/research/FEATURES.md`

## MemClaw Feature Surface (from SKILL.md, run.mjs, clawhub.json)

### 1. Core Concepts
- **Workspace** = 1:1 with a Felo LiveDoc (hosted KB)
- **Active Workspace** = session state, auto-binds all operations to the current LiveDoc
- **README** = agent's memory of the project (Goal / Rules / Write Rules / Document Directory)
- **Artifacts** = outputs the agent asks the operator before saving
- **Registry** = `~/.memclaw/workspaces.json`, project name → short_id
- **is_shared** = boolean, makes workspace read-only when true

### 2. CRUD Surface (20 documented commands; 24 total actions including task commands)

Documented subcommands (`memclaw/scripts/run.mjs`, ~34 KB single-file CLI):

- `create` LiveDoc, `list`, `update`, `delete`
- `resources` (list), `resource` (get one), `add-doc`, `add-urls`, `upload` (with `--convert`)
- `remove-resource`, `update-resource` (metadata), `update-resource-content` (full overwrite)
- `retrieve` (semantic search), `route` (relevant resources by query)
- `content` (cached local copy), `download` (source file)
- `get-readme`, `update-readme`, `append-readme`, `delete-readme`

Task commands (not listed in SKILL.md subcommands but exposed by `run.mjs` usage):

- `task` (run a task inside a workspace), `tasks` (list tasks), `task-result` (fetch a task's result), `ppt` (PPT generation via `/v2/ppts`) — total 4 task commands

Total: 20 documented + 4 task = 24 actions. The task commands are the seam where MemClaw ships hosted PPT generation; MemroOS rejects this surface per the enterprise review's paid-service gate.

### 3. Workflow Rules
- Auto-load workspace on first install (login flow + intro message written to MEMORY.md)
- README maintenance is **proactive** (agent updates without user permission)
- Write rules declarative: data type → target document
- Document Directory = registry of (name, purpose, resource_id) inside the README
- is_shared: skip writes entirely, never ask
- Multi-match disambiguation: ask user "X or Y?"
- Cache: `~/.memclaw/cache/{livedocid}/{resource_id}_{ts}.md`
- Always respond in the user's language; always include workspace link in confirmations

### 4. Backend Integration
- Felo API required (paid dependency)
- Three endpoint families: workspace CRUD, retrieval, PPT generation
- PPT async polling (10s interval, `ppt_url` on success)
- Web dashboard at `felo.ai/livedoc/{short_id}?from=claw`

### 5. Plugin Targets
- Claude Code (`.claude-plugin/`)
- OpenClaw (`~/.openclaw/skills/memclaw/`)
- Manual install

---

## MemroOS Coverage Map

| MemClaw feature | MemroOS equivalent | Status | Notes |
|---|---|---|---|
| Workspace (per-project isolation) | Spaces (TEAMSCALE-01..02, v8.2 P0) | **Planned** | MemClaw ships 1:1 project isolation today; MemroOS ships full multi-tenant spaces in v8.2 (Phases 130-131; Phase 128 is Policy Engine Core, not spaces) |
| Registry `~/.memclaw/workspaces.json` | MemroOS knowledge MCP + hive bus | **Shipped** | Stronger — git-backed, audit-logged, agent-API-keyed |
| README as memory | Run ledger (Phase 132) + Agent Context Packet (Phase 132) | **In progress** | MemroOS context packet already includes active goal, constraints, prior handoffs — strictly more than a flat README |
| Document Directory (name → resource_id) | Memory inventory (Phase 83) | **Shipped** | Memory inventory lists split-category provenance rows with source-of-truth tooltips |
| Write rules (data type → target document) | Memory adapter (v4.0 MemoryAdapter) + label-based routing | **Shipped** | Adapters check labels before indexing; richer (label dimensions vs. string rules) |
| Semantic retrieve | Qdrant + QMD + OpenInference traces | **Shipped** | Stronger — Qdrant cloud, retrieval receipts, GraphRAG optional |
| Read-only shared workspace (`is_shared`) | Spaces (TEAMSCALE) + label policy (MEMSEC-01..08) | **Mostly shipped** | Per-tenant RBAC shipped in v3.0, label policy in v5.0; is_shared-style flag not surfaced as a single boolean |
| Web dashboard | Next.js operator console at `memroos.epiloguecapital.com` | **Shipped** | Self-hostable, no third-party dependency |
| File upload + auto-convert | `services/memory` mem0 ingestion (v4.0) | **Shipped** | |
| Felo API key + auth flow | MEMROOS_AGENT_API_KEY + WorkOS OAuth (gated) | **Shipped** | Local-first; no paid third-party |
| PPT generation async polling | **Not present** | **Missing** | Not a MemroOS scope; would belong to vertical adapters (PRODUCT-02) |
| Auto language matching | Hermes platform config | **Shipped** | |
| Cache `~/.memclaw/cache/...` | Local Qdrant + content cache | **Shipped** | |
| Plugin targets (Claude Code, OpenClaw, Manual) | GSDSTACK-10/11 thin adapters (Phase 136) | **Planned** | MemroOS goes further: Codex/Claude/Hermes/Discord/Telegram via same contract |
| Single CLI script `run.mjs` (34 KB) | Multi-service stack (Next.js + FastMCP + FastAPI + Python) | **Heavier** | Operational surface area is real; CLI-only is a strength for MemClaw |

---

## What MemroOS LACKS that MemClaw does well

Even though MemroOS is a much heavier and more governable system, MemClaw has specific UX patterns MemroOS should adopt:

### 1. Single-command "load workspace" + auto-context-packet binding
- **MemClaw:** `Load the Acme workspace` → agent knows the README, the directory, and binds all writes/reads
- **MemroOS:** Agent Context Packet (Phase 132) already does the binding, but operator UX is more spread out (multiple routes, NOC home, library)
- **Gap:** there is no single operator command "load this client context" that primes the agent for that project and routes writes/reads to its space

### 2. Declarative Write Rules surfaced in operator UI
- **MemClaw:** README's "Write Rules" section is a table the operator can read; agent enforces it
- **MemroOS:** Memory adapters do the routing, but operators have no visible declarative rule surface
- **Gap:** "what goes into which space/label" is internal to the adapter chain; should be operator-visible and editable

### 3. is_shared: a single boolean read-only flag
- **MemClaw:** One boolean makes the workspace read-only. Agent cannot bypass.
- **MemroOS:** Equivalent exists as label policy + RBAC, but it's a composition of multiple checks, not a single declarative flag
- **Gap:** No "shared read-only" toggle that's a one-click operator action; current flow requires policy edit

### 4. Document Directory as first-class surface
- **MemClaw:** README has a Document Directory table the agent and operator both use as ground truth
- **MemroOS:** Memory inventory (Phase 83) has split-category counts + provenance rows, but the "document directory" pattern (name → ID) is implicit
- **Gap:** A first-class document directory per space (name + purpose + resource/artifact ID) would give the operator and the agent the same lookup table

### 5. Cache invalidation transparency
- **MemClaw:** `~/.memclaw/cache/{livedocid}/{resource_id}_{ts}.md` — local cache, timestamped, transparent path
- **MemroOS:** Qdrant cache, content-addressed storage, but no operator-visible "what's cached for this space" view
- **Gap:** Operators cannot see or invalidate caches per space

### 6. Save-artifact gate (ask-once, no perm prompt)
- **MemClaw:** After producing a long-form result, agent asks "Save this to the project?" once, then never asks again
- **MemroOS:** Memory adapter writes immediately on durable save; the operator has a "publish to space" gate but it's not unified
- **Gap:** A single "save to current space" prompt + auto-README update would lower the friction for ad-hoc artifacts

---

## What MemroOS SURPASSES MemClaw at (and shouldn't lose)

1. **Governance** — MEMSEC labels, belief stages (bronze/silver/gold), hash-chained audit, raw vault. MemClaw has none.
2. **Self-host** — No paid Felo API required. MemClaw is hosted-only.
3. **Multi-agent / multi-tenant** — Spaces, teams, delegation chains. MemClaw is single-user (with team invite, but flat).
4. **Evidence bundles / run ledger** — Universal proof of every action. MemClaw has only the workspace README.
5. **Proactive recollection** — Memory search before plan/tool/final (Phase 118). MemClaw is recall-on-demand.
6. **Eval/lane system** — SkillForge, W-lift evals, lane policy. MemClaw has no eval substrate.
7. **Skill contracts** — Portable skills with trust chain. MemClaw skills are static SKILL.md files.
8. **Policy engine** — POLGOV-01..05 (planned). MemClaw has no policy plane.
9. **Memory belief stages** — Bronze/silver/gold with promotion receipts. MemClaw has flat resources.

---

## Proposed v8.4 — Project-Centric Operator UX (Phases 137-141)

Source the gap above into the v8.4 milestone. Each is a small, scoped phase, not a new surface area.

**Goal:** close the operator-UX gap with MemClaw's project-isolation model without sacrificing governance. **Borrow:** declarative write rules, document directory, single-load workspace, is_shared boolean. **Preserve:** MEMSEC labels, audit chain, evidence bundles, raw vault.

| Phase | Title | Requirements | Depends on | Why |
|---|---|---|---|---|
| Phase 137 | Single-Load Workspace + Auto Context Packet | `WORKLOAD-01..05` (new) | Phase 132, Phase 130 | One operator command "load Client X" primes the agent; binds active space to all subsequent writes/reads. MemClaw parity. |
| 138 | Operator-Visible Write Rules + Document Directory | `WRITERULES-01..06` (new) | Phase 83, Phase 130 | "What goes into which space" as a table the operator can read and edit. MemClaw parity. |
| 139 | is_shared: Single-Boolean Read-Only Toggle | `SHAREDRO-01..03` (new) | Phase 76 (retrieval gate), Phase 130 (spaces), Phase 137 (workspace binding) | One-click "share this space read-only" replaces the current multi-step policy edit. MemClaw parity + policy receipt. |
| 140 | Per-Space Cache + Invalidation Surface | `CACHEADMIN-01..05` (new) | Phase 76 (retrieval gate), Phase 137 (workspace binding), Phase 139 (is_shared enforcement) | Operator can see and invalidate caches per space. MemClaw parity; evidence-bundled. |
| 141 | Save-Artifact Gate + Auto-README Update | `ARTGATE-01..03` (new) | Phase 137, Phase 138 | "Save to current space" prompt with auto-README directory update. MemClaw parity; the agent's `Run Ledger` is the README. |

### Draft requirement definitions

```
WORKLOAD-01: An operator-facing command ("load <space>") primes the Agent Context
             Packet for that space and binds it as the active workspace for all
             subsequent writes, reads, and the NOC/lane surfaces.
WORKLOAD-02: When a space is loaded, the active workspace is recorded in the
             run ledger as an event with actor, space id, and timestamp.
WORKLOAD-03: Adapter calls without an active workspace prompt the operator
             to select one (matches MemClaw's "There is no active project
             right now — which project do you want to operate on?").
WORKLOAD-04: Headless / non-interactive agent runs (no operator present)
             FAIL CLOSED: no silent default workspace, no last-used fallback
             in shared/team mode; the load event references
             actor="system:headless" and a run-ledger reason.
WORKLOAD-05: Cross-space read is allowed but always policy-receipted; the
             loaded space is the WRITE target, not the read universe; reads
             across spaces are surfaced in the run ledger.

WRITERULES-01: Each space has a declarative "Write Rules" table (data type →
               target document/resource) editable in the operator UI.
WRITERULES-02: The agent's memory adapter consults the Write Rules table
               before routing a save; mismatches are surfaced as receipts,
               not silently re-routed.
WRITERULES-03: Each space has a Document Directory (name + purpose +
               resource/artifact id) editable in the operator UI.
WRITERULES-04: Write Rules + Document Directory ship in the run ledger on
               every change, so the agent's view stays in sync with the
               operator's.
WRITERULES-05: Operator edits to Write Rules / Document Directory are
               VERSIONED + LOCKED; concurrent agent writes during an edit
               either wait or fail with a policy receipt (no silent
               overwrite, no race-condition loss).
WRITERULES-06: Write Rules are SCHEMA-VALIDATED (data type, target
               document, fallback rule); invalid rules are rejected at edit
               time with a structured error, not at write time with a silent
               reroute.

SHAREDRO-01: A single boolean `is_shared` flag on a space makes it read-only
             for all agents (no writes, no README updates, no document
             creation), and the flag is enforced at BOTH the retrieval gate
             (Phase 76, read-side) AND the write-persistence gate (memory
             adapter write path, save-artifact path, README-update path,
             document-creation path), not as a UI-only toggle. A single
             source of truth (the space record) drives both enforcement
             points.
SHAREDRO-02: The `is_shared` flag is policy-receipted: every read or attempted
             write produces a receipt that references the flag and the space
             id, so the audit chain explains why a write was blocked.
SHAREDRO-03: Operator UI shows a single "Share read-only" toggle per space;
             toggling emits a run-ledger event with actor and timestamp;
             toggling off requires a policy reason.

CACHEADMIN-01: Each space exposes its current cache state (per-resource
               last-fetched timestamp, total cached size, retrieval count)
               in the operator UI.
CACHEADMIN-02: Operator can invalidate a single resource cache or the
               whole space cache; invalidation emits a run-ledger event.
CACHEADMIN-03: Cache invalidation respects MEMSEC labels and the `is_shared`
               flag; shared read-only spaces expose invalidate-from-source
               only with a policy receipt.
CACHEADMIN-04: Thundering-herd protection: cache invalidation is rate-limited
               and bounded per space; concurrent invalidations for the same
               resource coalesce into a single event; an invalidation loop
               (operator action repeated >N times in <T) emits a rate-limit
               receipt.
CACHEADMIN-05: Invalidation events are queryable from the run ledger (who
               invalidated what, when, why) and are surfaced in the NOC
               governance strip.

ARTGATE-01: When the agent produces a long-form artifact (report, document,
            deck) for a loaded space, the operator gets a single
            "Save to <space>?" prompt — no recurring permission dialog.
ARTGATE-02: On save, the agent appends the artifact to the Document
            Directory (or creates a new document) and emits a run-ledger
            event with the resource id and belief stage.
ARTGATE-03: On save, the agent updates the space README's "Last artifact"
            pointer in the Document Directory; the operator can disable
            auto-update per-space; auto-updates are policy-receipted.
```

---

## Anti-Features to Reject from MemClaw

These MemClaw features should **not** be ported — they conflict with MemroOS principles:

| MemClaw feature | Reject because |
|---|---|
| Felo API dependency | Standing gate: zero paid services, MIT-OSS only |
| Hosted LiveDoc backend | MemroOS is self-hostable; host dependency is a SOC2 tenancy collapse per enterprise review (`.planning/research/notes/...` referenced) |
| PPT generation | Not in scope (vertical adapters, PRODUCT-02 future) |
| Auto language matching without operator override | Hermes already does it; not worth a phase |
| Single 34 KB CLI | MemroOS has more surface area by design (governance, evidence, evals); not a regression |
| Workspace per project, no cross-project memory | Cross-project recall is a MemroOS strength (Phase 72) |

---

## Adoption Decision (GSD-Ready)

Three GSD-shaped actions:

1. **Append v8.4 to ROADMAP.md** as PLANNED (Phases 137-141) — DONE
2. **Add all 22 requirements to REQUIREMENTS.md**: `WORKLOAD-01..05`, `WRITERULES-01..06`, `SHAREDRO-01..03`, `CACHEADMIN-01..05`, `ARTGATE-01..03` (the original 16 from the initial analysis plus 6 added in the GLM 5.2 thinker pass: `WORKLOAD-04/05` for headless fail-closed and cross-space read receipts; `WRITERULES-05/06` for write-path concurrency/versioning and schema validation; `CACHEADMIN-04/05` for thundering-herd protection and run-ledger invalidation queries) — DONE
3. **Track v8.5-v8.9 sequencing**: v8.5 Skill Trust Chain, v8.6 Memory Lifecycle + Erasure, v8.7 Orchestration Evidence Depth (all P1); v8.8 Retrieval Quality + External Benchmark Proof (P2); v8.9 Governed Ontology Foundation (P2). The "Defer Trust + Retrieval Proof" framing from earlier drafts is superseded — Skill Trust is now v8.5 P1. The MemClaw-derived UX work in v8.4 feeds the spaces/lanes consumed by v8.5 trust contracts.

**Open question:** is v8.4 a separate milestone or foldable into v8.2 (Team-Scale Access)? Two arguments:
- **Separate:** each phase is small and unblocks the operator's day-1 onboarding UX gap
- **Folded:** TEAMSCALE-01..02 already touches spaces; adding load-workspace into that work might be cheaper

**Recommendation:** keep v8.4 separate. The five phases are tightly scoped, shippable in waves, and operator-UX is a different concern from governance-plane (TEAMSCALE). Mixing them will slow both.

---

## Models Used

- **Thinker:** GLM-5.2 max via Z.AI (`https://api.z.ai/api/coding/paas/v4`). The `zai` provider block was restored mid-session from `~/.hermes/config.yaml.pre-global-glm52-20260630-102053.bak` and `GLM_API_KEY` was sourced from chat-supplied credentials. The thinker pass ran against the v8.4 draft phases and produced 14 distinct feedback items (phase scoping ACTs, dependency-graph ACTs, success-criteria ACTs, anti-feature RISKs, strategic callouts). Five of the ACTs were applied to the draft before the validator pass (Phase 139 → 137 dependency; Phase 140 → 76 + 139 dependencies; WORKLOAD-04 headless fail-closed; WRITERULES-05/06 versioning + schema validation; CACHEADMIN-04/05 thundering-herd + ledger queries). The remaining items (Phase 141 ACT/SPLIT, Phase 138+139 ACT/MERGE, space-init QUESTION, Phase 138 inventory-vs-write dependency QUESTION, headless fail-closed Phase 137 RISK, multi-context loading anti-feature RISK, auto-README no-silent-write RISK, Day-1 vs Day-2 strategic QUESTION, flat-memory vs Spaces QUESTION, wave ordering GSD-shape ACT) are deferred for explicit Luis review before commit. Full response persisted at `content/research/raw/glm5.2-thinker-response-2026-07-07.json` (tracked in repo for durability).
- **Worker:** MiniMax-M3 (Alba) — wrote the research artifact, ROADMAP.md v8.4 section, REQUIREMENTS.md 22 new requirement IDs, and applied all five post-thinker ACTs. Resolved Codex validator findings iteratively (4 passes).
- **Validator:** Codex 0.142.5 (codex-cli at `/opt/homebrew/bin/codex`) — `codex exec review --uncommitted` against the staged diff. Five rounds of feedback applied: (1) P2 requirement-traceability missing IDs (WORKLOAD-04/05, WRITERULES-05/06, CACHEADMIN-04/05); (2) P2 + P3 wrong-phase dependencies (Phase 128 is Policy Engine Core, not Spaces — Spaces is Phase 130); (3) P2 + P2 source URL drift and write-path enforcement gap on `is_shared`; (4) P2 + P2 milestone-numbering collision and source/REQUIREMENTS divergence; (5) P2 + P2 priority-order insertion and model-provenance contradiction (this round).

- **Hermes config (for GLM-5.2 restoration):** `~/.hermes/config.yaml.pre-global-glm52-20260630-102053.bak`
---

## Sources

- **MemClaw:** `github.com/Felo-Inc/memclaw` SKILL.md (24 KB), run.mjs (34 KB), clawhub.json
- **MemroOS planning:** `.planning/ROADMAP.md` (Phases 1-136, 85 phases), `.planning/REQUIREMENTS.md`, `.planning/research/FEATURES.md`, `.planning/MILESTONES.md`
- **MemroOS comparative research:** `content/research/memroos-vs-artyfacts.md`, `content/research/memroos-enterprise-review-2026-07-06.md`
- **MemroOS operator UX gap notes:** `.planning/notes/operations-noc-real-data-requirements.md`
- **Hermes config (for GLM-5.2 restoration):** `~/.hermes/config.yaml.pre-global-glm52-20260630-102053.bak`
