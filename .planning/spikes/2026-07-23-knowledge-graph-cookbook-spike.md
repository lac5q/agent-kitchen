# Anthropic Knowledge Graph Cookbook Spike

Requirement: `GRAPHGUIDE-FOLLOWUP-01`

Status: completed bounded spike, 2026-07-23

## External Signal

Anthropic's official cookbook guide *Knowledge Graph Construction with Claude*
(https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide,
published 2026-03-23) demonstrates a 5-stage pipeline for building a queryable
graph from documents: Extract (Haiku) → Resolve (Sonnet) → Assemble
(NetworkX) → Summarize → Query.

The X post that surfaced this in our thread
(https://x.com/0xCodez/status/2080250266851463209) is third-party packaging
of the cookbook. It frames the same pipeline as "shared memory for
multi-agent systems," which is an inference — the cookbook itself is a
single-pipeline document-to-graph tutorial and does not address agent
memory, concurrency, write conflicts, or governance.

Sources:

- https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide
- https://x.com/0xCodez/status/2080250266851463209
- X promo thread → https://movez.substack.com/

## Repo Baseline

MemRoOS already has:

- git-backed canonical markdown knowledge base with file/line provenance
- MCP-gatekept `knowledge_write` / `knowledge_read` / `knowledge_search`
  (audit, schema, retention, label, and redaction enforcement)
- Neo4j / Aura graph tier for relationships (`MEMTIER-01..06`, projected
  from mem0/Qdrant via idempotent projection)
- Qdrant Cloud vector store as the canonical similarity surface
- qmd lexical/BM25 index (explicit rule: vector search remains Qdrant)
- NOC-side freshness, recall anchors, and source-evidence contracts
- PROV hash-chained audit receipts (PROV-01..04 shipped in Phase 120)

## Comparison Result

The cookbook's strongest transferable pieces are:

- Two-model split: cheap model for high-volume triple extraction, stronger
  model for alias resolution and conflict arbitration. Maps cleanly onto
  our cost-conscious defaults (Haiku for bulk, Sonnet for judgment).
- Pydantic schema as the only "training" required — fits our typed-output
  MCP tools.
- Source-doc-on-every-edge discipline: every answer cites the edge it
  came from. We have this at the document level (Git + MCP audit) but not
  yet at the fact/edge level.
- The cookbook's persistence layer is explicitly swappable: extraction
  and resolution code is fixed; the storage layer (NetworkX → Neo4j →
  Postgres tables) changes. This validates the pattern we already
  operate: markdown canonical, graph as derived projection.

The cookbook's weakest claims are the ones the X promoter borrows:

- It runs in-memory on six Wikipedia summaries. There is no production-
  ready database, no multi-agent coordination, no concurrent-write
  handling, no conflict resolution, no durability story, no auth model.
- The cookbook itself flags dropped names and over-merging as failure
  modes ("Gemini 12" folded into "Project Gemini", recall dropping on
  verbose canonical forms). A drop-in shared-memory layer is not
  supported by the evidence.
- "Senior Anthropic engineer / 12-page PDF" is mischaracterized. The
  source is a corporate-published cookbook tutorial with runnable code,
  not a research paper by a named author.

The safe test lane, if we later choose to adopt any piece, is a
read-only shadow projection over existing content (qmd + mem0 candidates),
computing entity/relation triples + alias resolution in-memory, with no
change to write paths. The cookbook is a recipe, not an architecture.

## Decision

Do not add this as a dependency, swap the storage backend, route live
ingestion through it, replace the MCP gatekeeper, or claim "multi-agent
shared memory" delivery from MemroOS based on this cookbook.

The transferable lessons worth capturing in a future, approval-gated
phase are:

- entity resolution is the highest-leverage retrieval upgrade (the
  cookbook's "Buzz Aldrin / Edwin Aldrin" example is the exact failure
  mode keyword search cannot solve).
- fact-level provenance on every graph edge is a natural extension of
  PROV-01..04.
- a derived, read-only graph projection over canonical markdown keeps
  MemroOS's source-of-truth story intact while enabling multi-hop
  queries.

Any of those become a new phase, requirement IDs, and PLAN files when
explicitly approved. Not this spike's job.

## Guardrails

- No dependency adoption (no Anthropic-Graph cookbook code, no LangGraph,
  no NetworkX-in-prod, no Neo4j feature work beyond existing `MEMTIER`
  path).
- No replacement of canonical storage (markdown + Git stays canonical;
  Qdrant stays canonical for similarity).
- No production write path through the cookbook pipeline.
- No MCP gatekeeper bypass (all writes still go through `knowledge_write`
  with audit/receipts).
- No "shared memory for agents" claim, no concurrency guarantees, no
  multi-agent coordination contract derived from this cookbook.
- No raw corpus upload to a hosted service for this cookbook.
- No promotion of the X post's "12-page paper from a senior engineer"
  framing — the source is an Anthropic-published cookbook tutorial.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
Proposal-mode adoption is blocked until a follow-up phase adds
`GRAPHGUIDE-IMPL-01..N` requirements and a PLAN.md.
