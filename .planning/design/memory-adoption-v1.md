# Seamless Memory Adoption — Design v1 (2026-07-26)

Problem owner: Luis (operator session 2026-07-26). Inputs: grounded repo audit (§2 below); `.planning/notes/2026-06-23-proactive-recollection-gsd-requirement.md`; `.planning/phases/118-proactive-recollection-triggering/118-01-PLAN.md`; `.planning/phases/117-noc-efficiency-telemetry/117-01-PLAN.md`; `.planning/spikes/2026-06-27-memento-memory-save-quality.md`; `.planning/notes/2026-06-26-bronze-silver-gold-memory-belief-stages.md`; v8.16 observe plane (`docs/integrations/observe-capture.md`); `agents/AGENTS_TEMPLATE.md` "Skills > Memory" directive (2026-07-09); `content/research/memroos-persist-failure-rca-2026-07-05.md`.

## 1. Problem statement

MemRoOS's core promise (`.planning/GOAL.md` line 31): **"Agents should not start from zero when a team already solved, discussed, debugged, or decided something."** Today that promise is not kept in real agent sessions:

1. **Agents don't check.** No agent session (Claude Code, Codex, Cursor, Hermes, Pi) reliably asks MemRoOS "is there prior work on this topic?" before starting. An employee-agent picking up a topic is never prompted to learn that work already exists.
2. **Agents don't store enough, or store poorly.** Sessions end without structured memory writes; what does get captured automatically is 240 characters of raw JSONL.
3. **Brute-force injection is not the answer.** Stuffing memory into every session burns context and violates the "explicit memory management with tiers and receipts" architecture MemRoOS chose in the Phase 118 research note.

The fix must make recollection and storage **natural** (the default path of least resistance), **cheap** (pointer-sized, not payload-sized), **governed** (audited, policy-gated, belief-staged), and **measurable** (adoption is an SLO, not a hope).

## 2. Grounded current state (repo audit, 2026-07-26)

The machinery mostly exists. The seams were never connected.

| Capability | State | The gap |
|---|---|---|
| Recollection policy kernel (Phase 118) | Shipped **twice**: `apps/memroos/src/lib/recollection-policy.ts` (449 lines) and the richer `apps/memroos/src/lib/gsd/proactive-recollection.ts` (611 lines, wider trigger vocabulary, EFFTEL-04 guard) | **Zero live callers.** Only runtime wiring is `buildContextInjection()` in `lib/agent-runtime/memory-client.ts:227`, which has no production callers. Not one of the 30 MCP tools triggers recollection. |
| Recollection receipts + NOC read model | `lib/memory-trace-observability.ts` + `app/api/operations/noc/route.ts:472-600` + `efficiency-signals.tsx` | Only writer is `POST /api/agent-memory/traces`, gated **operator-key-only**. Agents cannot emit receipts. |
| Adoption metrics (Phase 117) | `retrievalBeforeWorkRate` (noc/route.ts:657) and `rediscoveredFactRate` (:670) computed correctly | `retrieval_trace` — the denominator of the single most important adoption metric — has **no agent-reachable emitter**. Real code over an empty table. |
| Governed memory write | `POST /api/memory/add` → policy + audit + dedup + `memory_write` event with `isRediscovery`; MCP `agent_memory_save` reaches it | Works — but is **not** in `CORE_TOOLS`. The default-visible MCP tools `memory_save`/`memory_search` post **directly to mem0**: no policy check, no audit row, no telemetry. The ungoverned path is the discoverable one. |
| Session capture (v8.16 observe plane) | `POST /api/agent-memory/capture` → `captureCodingAgentSession()` with redaction, depth policy, dedup, vault sealing; sidecar `scripts/run-observe-sidecar.mjs` walks 7 harness session roots | Operator-key-only (agents cannot self-capture); sidecar `summarize()` extracts **first 5 lines / 240 chars** — no decisions, files, errors, or verification; sidecar is **not scheduled anywhere**. |
| Silver→gold promotion (Phases 120-123) | `evaluatePromotionChecks` runs 5 deterministic checks (provenance, freshness, policy, conflict, dedupe); hash-chained decisions | `promoteCandidate` is called **only from evals and the manual operator queue**. Nothing promotes at runtime. Captured sessions accumulate as silver forever. |
| Salience + decay | `memory_salience` table + `lib/memory-decay.ts` | Keyed on `messages.id` only — agent-written memories and candidates have **no salience row**. |
| Save-quality scoring | — | Explicitly identified and deferred in the Memento spike: *"The gap is not storage. The gap is a reusable save-quality report."* Never built. |
| Session hooks | `scripts/claude-goal-state-handoff-hook.sh` exists but nothing installs it | **The repo ships no hooks at all.** No SessionStart / Stop / PreCompact configs anywhere. |
| Skill bootstrap | `AGENTS.md` tells every agent to call `knowledge_workspace_call("skill-packs","catalog",{"filter":"auto-load"})` | The catalog scans `$KNOWLEDGE_ROOT/skills`, **which does not exist in a MemRoOS checkout** (repo skills live in `.agents/skills/`). The bootstrap returns nothing. |
| Recall/save protocol skill | `docs/integrations/multica-memroos-skill.md` is the only start-of-task recall + end-of-task save protocol in the repo | It is a doc, not a SKILL.md; no `auto_load`; not in the catalog; not installed; Multica-scoped. GSD skills (`$goal`, beastmode) say "load memory **if available**" and name no tool. |
| Context packet | `GET /api/agent-context` **is** agent-key reachable, returns belief-staged memories with `whyIncluded` | Requires a `goal_id`; memories come from a metadata SQL filter, not topic recall. A fresh session on a topic gets an empty pack. No MCP wrapper. |
| After-the-fact adoption detector | `scripts/research-without-persist-detector.py` v3.0 (Hermes/OpenClaw) | Only 2 of 7+ harnesses; findings go to cron logs, not NOC Attention. |

## 3. Design principles

1. **Pointer, not payload.** Nothing injects full memories into sessions by default. Session start gets a **memory brief** ≤ ~600 tokens: belief-staged headline facts + "prior work exists: N items" pointers with fetch refs. Full content is always pull-on-demand.
2. **First call is free, later calls are habitual, every call pays off.** The first recall of a session is done *for* the agent (hook). Subsequent recalls are triggered by skills and tool-description contracts. Retrieval quality + usefulness feedback keep the tool worth calling — an agent stops calling a tool that returns junk.
3. **Structure beats exhortation.** AGENTS.md prose ("MUST search first") demonstrably didn't produce behavior (see persist-failure RCA). Enforcement moves into things that execute deterministically: hooks, tool contracts, save-quality gates, GSD closeout gates, and detectors that page the NOC.
4. **One governed write path.** No default-visible tool may write memory without policy, audit, dedup, and telemetry. Coach, don't just reject: a low-quality save returns an actionable receipt telling the agent what to add.
5. **Adoption is a metric with an SLO.** Recall-before-work rate, capture-per-session rate, rediscovered-fact rate, save-quality distribution — per agent, per harness, on the NOC. What isn't measured stays folklore.
6. **Respect the "Skills > Memory" ordering (2026-07-09 directive).** Repeated procedures become skills (SkillForge); class lessons live in skills; **memory** holds decisions, outcomes, project facts, entity facts, and handoff state. The capture rubric encodes this split so we don't fill mem0 with what belongs in a SKILL.md.
7. **Existing guardrails hold.** No new memory backend. No LLM-only silver→gold promotion. Depth default stays `relevant`; no transcript dumping into mem0. Belief stages label everything injected (rely on gold, caveat silver, bronze is evidence only). Recall failures fail **open** (a dead brain must not block work — receipt records the miss); policy checks on writes fail **closed**.

## 4. The adoption loop

```
SESSION START   hook injects memory brief (≤600 tok): top gold facts for this
                project + "3 related work items exist — call memory_prior_work"
      │
TASK BOUNDARY   agent calls memory_prior_work(task text) — cheap digest in,
                titles + belief stage + fetch refs out; server emits
                retrieval_trace receipt (served OR skipped, with reasons)
      │
DURING WORK     pull-on-demand reads (memory_recall / knowledge_read);
                tool_record_outcome feeds usefulness back into ranking/salience
      │
SESSION END     Stop/PreCompact hook posts structured capture: decisions,
                outcomes, errors, files, verification — or a typed skip receipt
      │
ASYNC           observe sidecar (scheduled) backstops non-compliant harnesses
                with structured extraction → silver candidates
      │
PROMOTION       scheduler runs the 5 deterministic checks; silver→gold with
                hash-chained receipts; conflicts → operator review queue
      │
FEEDBACK        NOC adoption panel + without-persist detector; GSD closeout
                gate requires probe + learnings receipts per phase
```

Active capture (agent self-reports at session end) is the high-trust signal; passive capture (sidecar) is the floor so even non-compliant agents contribute. Both land as **silver** candidates; only deterministic promotion mints gold.

## 5. Component design

### 5.1 Prior-work probe (the "is there already work on this?" primitive)

New governed endpoint `POST /api/memory/prior-work` (agent-key auth via `authenticateAgentHeaders`) + MCP tool `memory_prior_work` in `CORE_TOOLS`.

- **In:** task statement, optional repo/project/entities/recency hints.
- **Behind it:** the Phase 118 kernel — trigger policy → bounded query planner → tier search (episodic/vector/graph/qmd as healthy) → ranking (relevance, recency, salience, freshness, prior usefulness, policy risk) → threshold.
- **Out (digest, never payload):** ≤5 items of `{title, one_liner, belief_stage, age, salience, fetch_ref}` + an explicit natural-language headline: *"Related prior work exists: N items"* or *"No prior work found (searched episodic+vector+graph)"*. Skip decisions return typed reason codes.
- **Receipts:** every probe — served or skipped — emits a `retrieval_trace` efficiency event with the full recollection receipt. This is the wire that finally populates `retrievalBeforeWorkRate` from real sessions.

Why this makes recall *natural*: one tool, one cheap call, tiny response, always answers the exact question an employee-agent has at a task boundary. The tool's own description carries the trigger contract (tool descriptions are the one injection surface that is always in context and costs ~50 tokens).

### 5.2 Session hooks (structural, per-harness)

Shipped in-repo and installed by `scripts/install-agent-integrations.sh` (which already reaches 13+ harness targets):

| Hook | Harness event | Action | Failure mode |
|---|---|---|---|
| memory-brief | Claude Code `SessionStart` (+ Codex/GSD portable-hook equivalent, Hermes plugin) | Call prior-work probe with repo/branch/cwd context; inject ≤600-token brief | **Fail open** — timeout ⇒ session proceeds, miss receipt recorded |
| capture-gate | Claude Code `Stop` / `PreCompact` | Post structured session capture (decisions, outcomes, errors, files, verification) or typed skip receipt | Bounded timeout; failure ⇒ receipt + NOC Attention item, never a blocked session |

Harnesses without hook support fall back to skill + sidecar; the capability matrix is committed and drift-gated exactly like the observe-sidecar maturity matrix.

### 5.3 Capture self-service + extraction upgrade

- `/api/agent-memory/capture` accepts **agent keys** (scoped: an agent captures only its own sessions), keeping operator key for the sidecar. Rate-limited; depth policy enforced server-side (unchanged: `relevant` default, `full` seals to vault only).
- Sidecar `summarize()` replaced with structured extraction: decisions made, outcomes/verification, errors hit, commands run, files touched, entities — populating the rich fields `captureCodingAgentSession` already accepts but never receives. Deterministic-first (headers, tool-call records, diff stats); LLM assist only where depth policy allows.
- Sidecar gets a real schedule (launchd/systemd/cron template installed by the installer) and a heartbeat in NOC observe health.

### 5.4 Save-quality gate (adopts the deferred Memento spike)

Every governed write is scored: memory type, source/provenance, dedupe, specificity (has outcome? has project scope? has entities?), promotion readiness. Score persists with the write.

- **Coach-back receipts:** sub-threshold writes return actionable guidance — "no outcome stated", "duplicate of `<id>` (rediscovery flagged)", "this is a procedure — propose a skill instead" — so agents learn the rubric in-band. Hard-reject only on policy violations.
- The rubric encodes Skills > Memory: procedural content gets steered to SkillForge proposals, not stored as memory prose.

### 5.5 Governance parity for default MCP tools

`memory_save` and `memory_search` (currently mem0-direct, in `CORE_TOOLS`) are either routed through the governed paths or demoted out of `CORE_TOOLS` in favor of `agent_memory_save` + `memory_prior_work`/`memory_recall`. End state: **no default-visible ungoverned memory write or untraced search exists.**

### 5.6 Promotion scheduler + salience extension

- A scheduler (same pattern as `startDecayScheduler`/consolidation) runs `evaluatePromotionChecks` over aging silver candidates: pass ⇒ gold with hash-chained receipt; conflict ⇒ operator review queue; stale ⇒ decay. **No LLM promotion — the 5 deterministic checks only.**
- `memory_salience` coverage extends to agent-written memories and candidates (today: messages only), and `tool_record_outcome` usefulness feedback reinforces salience so recall ranking improves with use.

### 5.7 Habit layer: skills + bootstrap fix

- **Fix the bootstrap:** skill-packs catalog falls back to the repo's own skills dirs when `$KNOWLEDGE_ROOT/skills` is absent, so the AGENTS.md auto-load convention actually returns skills in a MemRoOS checkout.
- **`memroos-recall` SKILL.md (`auto_load: true`)** — generalized from `multica-memroos`: start-of-task probe protocol, mid-task re-probe triggers (topic shift, unexpected error, "have we seen this before?" moments), belief-stage handling rules.
- **`memroos-save` upgrade:** end-of-task persist checklist covers *memory* writes (decisions, outcomes, facts, handoff state), not only document writes.
- **GSD skills hardened:** `$goal` step 4 changes from "load memory if available" to a named, mandatory `memory_prior_work` probe with receipt; beastmode/qwen-cloud get the same start/end checkpoints.

### 5.8 Adoption telemetry + gates

- **NOC Memory Adoption panel** (honest states per NOCUX rules): per-agent/per-harness recall-before-work rate, capture-per-session rate, rediscovered-fact rate, save-quality distribution, silver→gold throughput.
- **Without-persist detector generalized** to all Wave-1 session roots; findings surface as NOC Attention items.
- **GSD closeout gate:** a phase/goal cannot close without a prior-work probe receipt at start and a learnings/decisions write (or typed skip receipt) at close — enforced by a check script wired into CI like `check-roadmap-priority`.

## 6. Explicit non-goals

- No full-memory injection into sessions; the brief stays pointer-sized.
- No new memory backend, no mem0/Qdrant/Neo4j replacement.
- No LLM-only or hidden silver→gold promotion.
- No transcript dumping into mem0; depth policy and vault sealing unchanged.
- No blocking hooks: a degraded brain never stops an agent from working (recall fails open with receipts).
- No hosted/private trace upload; everything stays inside existing governance.

## 7. Adoption SLOs (measured on live operator data, not fixtures)

| Metric | Baseline today | Target after v8.30 |
|---|---|---|
| Retrieval-before-work rate | unmeasurable (empty stream) | measured, then ≥70% of working sessions |
| Governed memory write or typed skip receipt per working session | ~0 (unmeasured) | ≥1 per session |
| Rediscovered-fact rate | measured for `agent_memory_save` only | full coverage, declining trend across 30d |
| Silver→gold throughput | 0 automatic | >0 weekly, with receipts |
| Save-quality score | not scored | distribution visible; coach-back rate declining |

## 8. Decisions required

| # | Decision | Recommendation |
|---|---|---|
| D1 | Which Phase 118 module survives (`recollection-policy.ts` vs `gsd/proactive-recollection.ts`) | Consolidate into `lib/memory/recollection/` (LIBNORM-02-aligned), keep the richer trigger vocabulary + EFFTEL-04 guard from the gsd module, keep canonical `BeliefStage` export path stable; delete the loser. |
| D2 | `CORE_TOOLS` membership change (5.5) | Route `memory_save`/`memory_search` through governed paths (less breakage for existing configured agents than removal). |
| D3 | Hook distribution | Extend `install-agent-integrations.sh`; do not depend on the external GSD portable-hooks package for MemRoOS-owned hooks. |
| D4 | Capture-gate strictness | Receipts + NOC Attention on miss (soft), escalate to GSD closeout gate (hard) only at phase boundaries — never block an interactive session. |

## 9. Phase map

v8.30 **Seamless Memory Adoption** — Phases 191-195 (PRIORWORK, SELFCAP, SAVEQ, MEMHABIT, ADOPTTEL). Full requirement definitions in `.planning/ROADMAP.md` §v8.30 and `.planning/REQUIREMENTS.md`.

Sequencing: Phase 191 first (it creates the primitive everything else points at and turns on the headline metric). Phase 194 (habit layer) can land in parallel with 192/193. Phase 195 last — gates only make sense once the tools they demand exist. If capacity is tight, 191 + the two SELFCAP hook items are the smallest slice that changes real behavior.
