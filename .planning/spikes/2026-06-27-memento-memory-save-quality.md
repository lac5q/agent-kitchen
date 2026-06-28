# Memento Memory-Save Quality Spike

Requirement: `MEMGEN-FOLLOWUP-02`

Status: completed bounded spike, 2026-06-27

## External Signal

Memento presents itself as a local-first, LLM-agnostic memory layer backed by a single local SQLite file and MCP access. The relevant pattern for MemRoOS is typed, audited, local memory writes, not a backend replacement.

Source: https://runmemento.com/

## Repo Baseline

MemRoOS already has:

- `agent_memory_candidates` in `apps/memroos/src/lib/db-schema.ts`
- coding-agent capture and durable candidate generation in `apps/memroos/src/lib/agent-memory-continuity.ts`
- agent memory candidate regression coverage in `apps/memroos/src/lib/__tests__/agent-memory-continuity.test.ts`
- bronze/silver/gold reliance policy in `apps/memroos/src/lib/recollection-policy.ts`
- memory recall evals in `evals/memory-recall/cases.json`

## Comparison Result

Memento's useful idea is an explicit local write contract with typed, auditable records. MemRoOS already has stronger governance because candidate memories remain silver until promotion policy admits them and because route/API writes pass through security labels, audit, and recall receipts.

The gap is not storage. The gap is a reusable save-quality report that scores candidate memory writes for type, source, dedupe hash, provenance, and promotion readiness.

## Decision

Do not adopt Memento or change backends. Keep the current SQLite plus mem0/Qdrant/Neo4j split.

Add only future evaluation work if needed: a local fixture that converts a set of captured agent sessions into candidate rows and grades whether each candidate should be promoted, rejected, or kept silver.

## Guardrails

- No dependency adoption.
- No backend swap.
- No hosted or private trace upload.
- No replacement of mem0, Qdrant, Neo4j, SQLite, policy gates, or recall receipts.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
