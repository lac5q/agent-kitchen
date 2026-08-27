---
title: "RCA — every memory was unreachable, and the chat never asked for one (2026-08-27)"
date: 2026-08-27
model: claude-opus-5
agent: claude-opus-maeve-u1
host: memroos-ec-1
sources:
  - live inspection of memroos-ec-1 (Qdrant, mem0, operator API)
  - live inspection of cordant-hermes-01
  - apps/memroos/src/lib/memory/{backends,policy-gate,save-enrichment}.ts
  - apps/memroos/src/app/api/chat/chat-runtime.ts
derived_from: operator bug report — "searched gtm and got errors", "ask memmy never returns results"
regen_prompt: "Trace why memory search returns nothing and why the operator chat cannot answer from stored memories; fix both and verify in production."
---

# RCA — every memory was unreachable, and the chat never asked for one

Two independent defects presented as one symptom: "memory does not work."

## Defect 1 — MEMLABEL-01: all 1,449 memories were durable and unreachable

A real query returned **32 ANN hits and the policy gate denied all 32**.

Every point in the mem0 collection `agent_memory_local` carried neither a
tenant nor a visibility/policy label. Recall denies on both, in sequence:

1. `defaultPolicy` denies a candidate with no tenant as `candidate_tenant_missing`.
2. `normalizeLabel` then resolves a missing policy as `policy ?? "sealed"`, and
   `authorizeMemoryUse` denies a sealed candidate as `sealed_content`.

**The most important finding is that this was ongoing, not historical.** An
earlier fix had closed only the tenant half: `VectorMemoryAdapter.write` refused
an untenanted payload but never wrote a label, and its single caller supplied a
tenant and no label. So every newly saved memory was still written sealed.

The diagnostic that proved it: backfilling *only* the tenant moved all 32
candidates from `candidate_tenant_missing` straight to `sealed_content` — the
same failure, one check further down the same gate. Fixing the second half made
them reachable.

### Why the severity is "critical on reachability, not on confidentiality"

The gate failed **closed**. Nothing leaked, nothing was lost, every memory was
intact. What broke was the product's core promise: saves succeeded, reported a
quality score, were durable — and could never be found. The codebase already
names this the worse outcome than a rejected write; it happened anyway, because
the guard was written for one field and the gate checks two.

## Defect 2 — CHATRECALL-01: the chat never queried memory at all

`buildAgentContext` assembles the chat system prompt by reading static files
from a directory — `SOUL.md`, `AGENTS.md`, `MEMORY.md`, `LESSONS.md`,
`HEARTBEAT*.md`. It makes no call to the memory store. None.

So the operator chat was a plain model conversation wearing a MemroOS prompt.
Asked about prior work it answered *"I don't have any information about previous
conversations. Each conversation with me starts fresh"* — a true statement about
the model and a false one about the product. Its answer to "gtm solution" was
generic textbook content while the store held real Cordant GTM entries.

This was invisible because Defect 1 masked it: with recall returning nothing
anyway, a chat that never called recall looked identical to one that did.

Fix: the chat now runs the same recall the search page runs, under the **same
actor, scope and policy gate**, and injects the results with an explicit
instruction to ground the answer in them. It is a read through the existing
boundary, not around it — anything the policy denies in search is denied here.

## Two credential failures behind the same report

- The production `ANTHROPIC_API_KEY` was the literal placeholder
  `your-key-here`, producing `401 invalid x-api-key` on every fallback turn.
- OpenRouter returns `404 No endpoints available matching your guardrail
  restrictions and data policy` for **every** model tested, not just the
  configured one — an account-wide privacy setting, not a model-choice problem.

Both were reported by the product as one blended fallback message, which is why
the operator read it as "the chat is broken" rather than "two credentials are
wrong."

## Cordant is in a different, quieter failure

`cordant-hermes-01` does **not** have this backlog — because its mem0 has an
**empty `QDRANT_URL`** and null collection/point counts, while
`GET :3201/health` still reports `status: ok, vector_store: connected`. The same
fields are populated on memroos-ec-1. An operator checking Cordant's memory
health is told everything is fine. Filed as `CORDVEC-01`.

## Lessons

1. **A fail-closed gate that checks N fields needs a write guard that enforces
   N fields.** Guarding one and leaving the rest to defaults reproduces the exact
   bug the guard was written to prevent, one check further down.
2. **"Recall returns nothing" and "nothing calls recall" are indistinguishable
   from outside.** Fixing the first is what made the second visible.
3. **Health that reports `connected` for an unconfigured backend is worse than
   no health check**, because it converts an outage into a silent absence.
4. **A placeholder credential fails like a code bug.** `your-key-here` produced a
   401 that read as a provider problem; the string itself was the tell.

## Verification

- Same query that returned 0 results now returns **8**, recall status `applied`.
- Ask Memmy now answers from stored memories, cites three specific entries, and
  correctly states what the memories do *not* contain.
- Repo gate: 636 test files / 5,415 tests pass; typecheck clean; zero lint errors.
- Backfill was preceded by a Qdrant collection snapshot, so it is reversible.

Not backfilled: `agent_memory` (2,609 points), `user_context` (10),
`knowledge_docs` (43,305). Each needs a per-collection decision about whether it
is on a recall path before it is labelled.
