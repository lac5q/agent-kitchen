# GSD Roadmap Prioritization - 2026-06-19

## Decision

Prioritize security and trust-boundary hardening before new retrieval or tooling experiments. The roadmap has valuable future spikes, but the next durable product work should make storage, route authorization, runtime topology, and operator proof harder to misconfigure.

## Ranked Plan

1. **Phase 115 trust-boundary hardening (`ARCHREV-01`, `ARCHREV-09`, `ARCHREV-10`)**
   - Implement route-level privileged API protection inside handlers or route factories.
   - Keep proxy bypass regression coverage with any Next.js trust-boundary change.
   - Completed first slice: `ARCHREV-10` PII redaction before memory payloads leave MemRoOS for mem0/vector storage.
   - Completed second slice: handler-local operator guards plus direct non-local regression coverage for agent checkpoints, agent version control, memory trace observability, runtime observability dashboard, hive POST, and model-routing telemetry POST routes.

2. **Phase 115 runtime and config hardening (`ARCHREV-04`, `ARCHREV-05`)**
   - Create one runtime topology manifest for required services, ports, health checks, and supervision mode.
   - Centralize typed env validation and reduce direct `process.env` reads.
 - Advanced `ARCHREV-04`: added shared JSON runtime topology manifest plus standalone `check:runtime-topology` validation Docker/startup drift; `start.sh` derives manual-script port defaults checker and `scripts/launchd-start.sh` derives launchd app port defaults after runtime env and Node path resolution. Docker compose still needs generation/direct derivation follow-up.

3. **Public evidence refresh**
   - Reconcile memroos.com, README, screenshots, metadata, and LLM-readable docs with v6.4-v7.3 shipped state.
   - Keep claims tied to visible operator proof, not planned managed-cloud readiness.

4. **Phase 117 NOC efficiency telemetry (`EFFTEL-01`..`EFFTEL-05`)**
   - Start with event sources for retrieval-before-work and same-source rereads.
   - Treat token-share, operator re-ask, and rediscovered-fact metrics as event-contract design work if schemas are not already clear.

5. **Bounded research spikes**
   - Memento: memory-save quality comparison only.
   - CocoIndex: one non-sensitive context lane freshness comparison only.
   - FastContext: read-only repo-scout comparison against GitNexus and grep only.
   - Turbovec/compressed vectors: future shadow-index experiment only with explicit approval.

## Implementation Readiness

Implementation-ready: `ARCHREV-01`, `ARCHREV-04`, `ARCHREV-05`, `ARCHREV-09`, `ARCHREV-10`, public evidence refresh, initial `EFFTEL-01`, and initial `EFFTEL-02`.

Decision-ready first: `ARCHREV-08` planning history public/private retention.

Spike-first: `MEMGEN-FOLLOWUP-02`, `COCOINDEX-FOLLOWUP-01`, `FASTCONTEXT-FOLLOWUP-01`, Turbovec/compressed-vector work, external pen test, SOC 2 mapping, and the more ambiguous parts of `EFFTEL-03`..`EFFTEL-05`.

## Stale State To Reconcile

- `STATE.md` says v7.3 Phase 116 is complete and Phase 115 should resume next.
- `MILESTONES.md` still frames Public Evidence Refresh as current.
- Phase 114 completion status differs across roadmap and requirements surfaces.
- `GOAL.md` predates v7.3/v7.4 and should be refreshed before a larger roadmap rewrite.
