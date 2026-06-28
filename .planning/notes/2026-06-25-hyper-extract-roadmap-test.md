# Hyper-Extract Roadmap Test

Source signal: Hasan Toor's June 25, 2026 X post surfaced Hyper-Extract as an open-source framework for turning messy documents into typed knowledge structures such as graphs, hypergraphs, temporal/spatial relations, Obsidian exports, and MCP-readable knowledge abstracts.

MemRoOS fit: this is not a memory backend or governed operations-plane competitor. It is a possible extraction adapter or benchmark baseline for the pre-retrieval layer: raw document -> typed, source-span-backed candidate memory -> MemRoOS policy, provenance, dedupe, recall, and receipt surfaces.

Add `HYPEREXTRACT-FOLLOWUP-01` as a deferred, approval-gated future spike:

- Run only on non-sensitive or sanitized MemRoOS/knowledge documents.
- Compare Hyper-Extract outputs against current Markdown/QMD/mem0 ingestion.
- Require stable IDs, source-span provenance, policy labels, dedupe behavior, and answer-support receipts.
- Measure recall@5, precision@5, MRR, false-positive rate, supported-answer rate, token/cost impact, and handoff usefulness.
- Reject the path if graph/hypergraph structure adds noise, loses source boundaries, or creates ungoverned derived memory.

Guardrail: no dependency adoption, production ingestion path, private-document upload, default extraction pipeline, storage-layer replacement, or policy bypass starts without explicit Luis approval.
