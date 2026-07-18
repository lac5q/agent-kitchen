---
title: "Decision Plan: Should MemRoOS Switch Orchestration Hot Paths to an OTP Actor Fabric?"
description: "Go/no-go evaluation plan to decide whether MemRoOS should adopt Erlang/OTP as a peer (or replacement) for parallel consensus and orchestration concurrency — with baselines, bake-off design, gates, and kill criteria."
publishedAt: "2026-07-17"
createdAt: "2026-07-17T11:26:00Z"
updatedAt: "2026-07-17T11:26:00Z"
updatedAtTime: "2026-07-17T11:26:00Z"
version: "2026-07-17.1"
tags: [memroos, erlang, otp, orchestration, decision-plan, bake-off, research]
keywords: [go/no-go, decision plan, actor fabric, LangGraph, A2A, consensus, baseline]
author: "cursor-cloud-agent"
model: "cursor-grok-4.5"
sources:
  - "https://x.com/BrianRoemmele/status/2077741960614539392"
  - "content/research/roemmele-erlang-actor-fabric-memroos-fit-2026-07-17.md"
  - "content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md"
  - "content/research/mark-kashef-agent-stack-prioritization-2026-07-06.md"
  - "docs/integrations/langgraph.md"
  - "services/orchestration/"
  - "apps/memroos/src/lib/gsd/discuss.ts"
derived_from:
  - "content/research/roemmele-erlang-actor-fabric-memroos-fit-2026-07-17.md"
regen_prompt: "Given current MemRoOS orchestration seams and the Roemmele Erlang post, rewrite a go/no-go decision plan with measurable gates for adopting an OTP actor fabric."
---

# Decision Plan: Should MemRoOS Switch to an OTP Actor Fabric?

**Document version:** 2026-07-17.1  
**Created:** 2026-07-17 11:26 UTC  
**Updated:** 2026-07-17 11:26 UTC  
**Companion fit analysis:** [`roemmele-erlang-actor-fabric-memroos-fit-2026-07-17.md`](./roemmele-erlang-actor-fabric-memroos-fit-2026-07-17.md)

## 1. Decision question (precise)

**Not:** “Should we rewrite MemRoOS in Erlang?”  
**Yes:** “Should MemRoOS adopt an **OTP actor fabric as a peer runtime** for (A) bounded parallel multi-model consensus and/or (B) orchestration concurrency/supervision — and if so, should that later **absorb** LangGraph hot paths?”

Three mutually exclusive outcomes:

| Outcome | Meaning |
|---|---|
| **No switch** | Keep TS fleet plane + Python LangGraph; improve concurrency with Node/Python workers if needed |
| **Peer adopt** | Ship optional OTP sidecar for consensus / parallel dispatch; LangGraph remains policy owner |
| **Absorb switch** | OTP becomes primary orchestration concurrency layer; LangGraph deprecated or narrowed to graph DSL only |

The plan below is designed so **Peer adopt** can win without forcing **Absorb switch**. Absorb requires an extra gate.

## 2. Hypotheses to falsify

| ID | Hypothesis | If false → |
|---|---|---|
| H1 | Orchestration / consensus latency is dominated by **coordination runtime**, not model/API wait | No switch — tune prompts, routing, caching |
| H2 | On MemRoOS workloads, OTP beats a fair **TS or Python async** baseline by a material margin on wall-clock and failure isolation | Prefer cheaper concurrency (Node workers / asyncio / multiprocessing) |
| H3 | OTP integrates cleanly as a LangGraph-class peer without forking identity/memory/audit | Reject — ADR violation |
| H4 | Bounded parallel consensus (not open swarm) creates operator-visible value | Keep `/discuss` ledger-only |
| H5 | Ops cost of a third runtime is justified by H2+H4 | Peer adopt only if value >> ops tax |

## 3. Non-goals (in-scope exclusions)

- Zero-Human open-ended autonomous company / ungoverned swarm
- Replacing MemRoOS registry, governance, memory router, or operator UI
- Adopting Roemmele code/claims without reproducible local benchmarks
- Multi-month rewrite before Phase A–C gates pass

## 4. Success metrics (what “better” means)

Measure **orchestration overhead**, not model IQ.

### Primary (must move)

| Metric | Definition | Target for Peer adopt |
|---|---|---|
| **Consensus wall-clock** | Time to complete N parallel participant calls + merge/vote for fixed prompts | ≥ **2× faster** than best non-OTP baseline at N=5 and N=15 *after subtracting model wait* (see §6) |
| **Coordination overhead** | `wall_clock − max(participant_latencies)` | ≥ **50% reduction** vs best non-OTP baseline |
| **Failure isolation** | Kill 1 of N participants mid-round; round still completes with partial quorum | OTP (or any winner) must complete; baseline must not cascade-fail the run |
| **Fleet-plane integrity** | All runs emit MemRoOS audit + identity + budget receipts | 100% — hard gate |

### Secondary (tie-breakers)

| Metric | Why it matters |
|---|---|
| HIL resume latency under concurrent waits | Operator experience |
| p95 dispatch fan-out for multi-hop lineage | Orchestration scale |
| Memory / CPU at 100 concurrent lightweight “actors” (stub participants) | Validates actor density claim |
| Engineering hours to operate (deploy, debug, on-call) | Ops tax |
| Time-to-implement bake-off spike | Opportunity cost |

### Explicit non-metrics for this decision

- Model quality / win rate of “5-AI council” content
- Marketing narrative parity with Zero-Human Company
- Hot code reload as a product feature (nice-to-have only)

## 5. Fair comparison set (do not bake off OTP alone)

Every Phase C trial runs **four** implementations against the same harness:

| Contender | Intent |
|---|---|
| **A0 — Current** | Today’s path: sequential or ad-hoc parallel via existing A2A / Beastmode-style fan-out |
| **A1 — TS worker pool** | Node `Promise.all` / worker_threads behind same HTTP contract |
| **A2 — Python async / process pool** | asyncio or multiprocessing next to LangGraph service |
| **A3 — OTP sidecar** | Elixir/Erlang actors behind same HTTP contract |

**Rule:** Same participant stubs, same timeouts, same merge logic, same auth. Only the concurrency runtime differs.

If A1 or A2 meets primary targets, **OTP loses by default** (higher ops tax without unique gain).

## 6. Measurement method (avoid fake speedups)

Model calls dominate wall-clock. Without isolation, every runtime “looks the same.”

1. **Stub mode (required):** participants return after fixed sleep `S` (e.g. 200ms, 1s, 3s) with deterministic payloads — measures pure coordination.
2. **Live mode (optional):** real Ollama/cloud calls — reports both raw wall-clock and coordination overhead.
3. Report for each N ∈ {3, 5, 15, 50}:
   - wall-clock
   - coordination overhead
   - success/partial/fail rates under injected faults
4. Repeat ≥ 30 runs; publish median + p95.

Artifact location (proposed): `content/research/benches/actor-fabric-YYYY-MM-DD/` with raw JSON + one summary MD.

## 7. Phased plan with go/no-go gates

```text
Phase A  Problem proof     → Gate A
Phase B  Contract + spike  → Gate B
Phase C  Bake-off          → Gate C  (Peer adopt?)
Phase D  Product spike     → Gate D
Phase E  Absorb decision   → Gate E  (Absorb switch?)
```

### Phase A — Problem proof (cheap; no BEAM)

**Work**

1. Instrument current orchestration + discuss/dispatch paths:
   - per-run wall-clock, per-participant latency, queue depth, HIL wait
2. Capture 1–2 weeks of operator/agent workloads (or synthetic replay of recent Beastmode / discuss runs).
3. Attribute latency: `% model wait` vs `% coordination` vs `% MemRoOS proxy/auth`.
4. Survey whether operators want **parallel consensus** as a product surface (vs today’s ledgered `/discuss`).

**Gate A — Continue?**

Continue only if **any** of:

- Coordination overhead ≥ **15%** of wall-clock on target multi-participant runs, **or**
- Failure cascades / serialization pain block a named use case (parallel `/discuss`, multi-validator, multi-hop fan-out), **or**
- Product commits to shipping bounded parallel consensus regardless of overhead (strategic)

Else → **No switch**; close decision as “not a bottleneck.”

### Phase B — Contract + thin spike design

**Work**

1. Draft peer contract (mirror `docs/integrations/langgraph.md`):
   - `POST /consensus/rounds` start
   - status / events SSE
   - participant result schema
   - auth via MemRoOS API key / A2A task binding
   - mandatory audit callback to MemRoOS
2. Define stub participant protocol.
3. Spike sizing: 1 engineer-week max for A1+A2+A3 stubs behind one harness.
4. License/OSS watch: if Roemmele (or others) publish code, score reuse vs greenfield (license, API fit, maintenance).

**Gate B — Spike?**

Continue only if Gate A passed **and** contract keeps fleet-plane ownership intact (identity/memory/audit stay in MemRoOS).

### Phase C — Bake-off (the decision experiment)

**Work**

1. Implement A0–A3 behind identical harness (§5–§6).
2. Fault injection: kill participant, slow participant, poison payload, fabric process crash + restart.
3. Ops checklist: local docker run, health, logs, restart behavior, one-node failure (optional two-node only if Gate C leans yes).
4. Write decision memo (§9) with numbers.

**Gate C — Peer adopt?**

**Yes (Peer adopt)** only if **all** hard gates pass:

| # | Hard gate |
|---|---|
| C1 | Fleet-plane integrity 100% |
| C2 | Stub-mode coordination overhead: OTP (A3) beats **best of A1/A2** by ≥ 50% **or** uniquely passes failure-isolation scenarios A1/A2 fail |
| C3 | Live-mode (if run): no regression in success rate vs A1/A2 |
| C4 | Ops tax acceptable: one documented runbook; no new mandatory prod dependency for default installs |
| C5 | Bounded product path exists (`/discuss` or `/consensus`) — not open swarm |

**No** if A1/A2 win on metrics, or OTP only wins on microbenchmarks irrelevant to MemRoOS workloads.

**Maybe / hold** if Roemmele OSS lands mid-flight with better primitives — pause and re-bench with adoption option.

### Phase D — Product spike (only if Gate C = Yes)

**Work**

1. Feature-flagged OTP sidecar in compose; default **off**.
2. Wire one product path: parallel `/discuss` or `/api/consensus` with budget + ledger + HIL.
3. Dogfood on internal operator workflows for a fixed window (e.g. 2 weeks of real use).
4. Collect: round completion rate, operator override rate, incident count, p95 latency.

**Gate D — Keep peer in tree?**

Keep if dogfood shows clear value and zero ADR violations.  
Otherwise remove sidecar; retain harness/docs as negative knowledge.

### Phase E — Absorb switch (optional; separate decision)

Only after Gate D holds under load.

**Ask:** Should OTP absorb LangGraph concurrency/supervision hot paths?

**Gate E — Absorb?** requires:

- OTP peer stable in dogfood
- Clear migration map for checkpoints / HIL / lineage (`orchestration_runs`, `orchestration_lineage`, HIL interrupt parity)
- Deprecation plan that leaves **at most two** orchestration brains long-term (MemRoOS + one peer)
- Explicit owner for BEAM on-call

Default recommendation if Gate C/D pass but Gate E is ambiguous: **stop at Peer adopt**.

## 8. Work packages (execution checklist)

| WP | Owner skill | Depends on | Output |
|---|---|---|---|
| WP1 Latency attribution | Platform | — | Phase A report + Gate A |
| WP2 Peer contract draft | Architecture | Gate A | `docs/integrations/actor-fabric.md` draft |
| WP3 Harness + stubs | Eng spike | WP2 | Bench runner + JSON results |
| WP4 A1 TS pool | Eng spike | WP3 | Contender |
| WP5 A2 Python pool | Eng spike | WP3 | Contender |
| WP6 A3 OTP sidecar | Eng spike | WP3 | Contender |
| WP7 Fault + ops matrix | Eng spike | WP4–6 | Gate C evidence |
| WP8 Decision memo | Owner | WP7 | §9 filled; outcome recorded |
| WP9 Product spike | Eng (only if Yes) | Gate C | Flagged sidecar + one API |
| WP10 Absorb ADR | Architecture (only if considering E) | Gate D | Absorb / don’t absorb ADR |

**Cost control:** Confirm before starting WP4–WP6 (multi-contender spike). Phases A–B are cheap and should run first.

## 9. Decision memo template (fill after Phase C)

```markdown
# Actor Fabric Switch Decision — YYYY-MM-DD

## Outcome
- [ ] No switch
- [ ] Peer adopt (OTP sidecar)
- [ ] Absorb switch (OTP replaces LangGraph hot paths)
- [ ] Hold (waiting on OSS / more data)

## Evidence summary
- Gate A: …
- Stub coordination overhead (N=5/15/50): A0 / A1 / A2 / A3
- Failure isolation: …
- Ops tax notes: …
- Product value signal: …

## Why this outcome
…

## What we will not do
…

## Review date
YYYY-MM-DD
```

File as: `content/research/actor-fabric-switch-decision-YYYY-MM-DD.md`.

## 10. Kill criteria (stop immediately)

Stop the initiative (outcome = **No switch**) if any occur:

- Gate A fails (coordination is not the bottleneck)
- OTP cannot call MemRoOS for identity/audit without forking control-plane state
- Bake-off shows A1/A2 within ~20% of OTP on primary metrics
- Spike exceeds agreed budget without Gate C clarity
- Effort drifts into ungoverned swarm / Zero-Human scope
- No owner for BEAM operations when discussing prod enablement

## 11. Recommended starting move (this week)

1. Run **Phase A only**: instrument + attribute latency on multi-participant paths.
2. Write Gate A result into a short note.
3. **Stop for confirmation** before WP4–WP6 (the expensive bake-off).

That sequence answers “should we switch?” with evidence instead of narrative — and preserves the fleet-plane ADR either way.

## Bottom line

Treat “switch” as a **gated decision**, not a migration. Prove the bottleneck (A), design a peer contract (B), bake off OTP against cheaper concurrency (C), dogfood one bounded product path (D), and only then consider absorbing LangGraph (E). Most likely honest outcomes: **No switch** or **Peer adopt**; **Absorb switch** should be rare and separately justified.
