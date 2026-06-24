# OKF Memory Files Gap Review

Date: 2026-06-13
Source request: explore the Open Knowledge Format link from https://x.com/Marie_Haynes/status/2065531158356717721?s=20
Primary source reviewed: Google Cloud, "Introducing the Open Knowledge Format" (2026-06-12), and the OKF v0.1 draft spec in GoogleCloudPlatform/knowledge-catalog.

## Bottom Line

OKF is highly aligned with MemRoOS, but should not be treated as a storage migration. The useful move is an interoperability layer: export selected MemRoOS memory, skills, knowledge, receipts, and runbooks as conformant OKF bundles, and optionally ingest OKF bundles into governed MemRoOS memory with classification, provenance, and recall receipts intact.

Add it to the roadmap as "OKF-compatible memory bundles." The first safe slice is export-only: a validator plus operator-gated Claude-memory bundle export. Import, public claims, and broader source coverage should stay deferred until classification/provenance round-trip tests exist.

## 2026-06-13 MVP Implementation Note

Implemented an isolated OKF v0.1 support module and operator-only export route:

- `apps/memroos/src/lib/okf.ts` maps `MemoryEntry` records to OKF concepts, builds `index.md`/`log.md` bundles, parses documents, and validates required frontmatter plus broken bundle links.
- `GET /api/memory/okf/export?source=claude` exports local Claude memory as a JSON object containing the OKF bundle and validation metadata.
- The route requires a logged-in operator/admin through `authenticateUser` and `requireRole`.
- The implementation does not import OKF bundles, write files to disk, touch mem0/Qdrant/Neo4j/SQLite/raw-vault backends, or export non-Claude memory sources.

## What OKF Requires

OKF v0.1 defines a knowledge bundle as a directory tree of Markdown files with YAML frontmatter.

Conformance is intentionally small:

- Every non-reserved `.md` file has parseable YAML frontmatter.
- Every concept document has a non-empty `type` field.
- `index.md` supports progressive disclosure.
- `log.md` supports date-grouped update history.
- Markdown links express graph relationships.
- Consumers tolerate unknown types, unknown fields, broken links, and partial bundles.

Recommended frontmatter fields are `title`, `description`, `resource`, `tags`, and `timestamp`. Producers can add extra keys, and consumers should preserve unknown keys.

## Why It Fits MemRoOS

MemRoOS already has several adjacent primitives:

- Knowledge Gateway reads and writes Markdown files, including optional YAML frontmatter validation.
- Skill distribution already uses Markdown plus frontmatter and private/public catalog merging.
- Memory trust work already captures provenance, security labels, raw vault artifacts, authorization gates, and receipts.
- Competitive retrieval proof already wants public-facing evidence of what was retrieved, injected, ignored, authorized, and cited.
- Architecture review hardening already wants clearer contracts and topology manifests.

OKF would let MemRoOS speak a vendor-neutral knowledge format instead of making every integration learn MemRoOS-specific memory shapes first.

## What Not To Do

- Do not replace mem0, Qdrant, Neo4j, SQLite, or the raw vault with OKF.
- Do not export all memories by default. Security labels and retrieval authorization still govern export.
- Do not flatten raw private memory into public Markdown.
- Do not make OKF ingestion bypass classification, provenance, duplicate suppression, or policy gates.
- Do not promise full OKF conformance until a validator/export smoke test exists.

## Recommended Product Shape

### OKF-FOLLOWUP-01 - OKF Concept Mapper

Define a MemRoOS-to-OKF mapping for memory records, skills, agents, tools, receipts, runbooks, and knowledge files.

Suggested type values:

- `Memory Entry`
- `Skill`
- `Agent`
- `Tool`
- `Runbook`
- `Evidence Receipt`
- `Knowledge Source`
- `Project`

MemRoOS-specific fields should remain extension fields, for example:

- `memroos_id`
- `tenant_id`
- `agent_id`
- `source_type`
- `security_label`
- `classification`
- `provenance_hash`
- `receipt_id`
- `authorization_policy`
- `raw_artifact_id`

### OKF-FOLLOWUP-02 - Governed OKF Export

Add an export path that writes an OKF bundle from selected scopes only after policy checks.

Minimum export artifacts:

- `index.md` at bundle root.
- Concept Markdown files with `type`.
- `log.md` with export/update history.
- `references/` or citation sections for source-backed claims.
- Export manifest with scope, redaction policy, timestamp, and operator/agent identity.

### OKF-FOLLOWUP-03 - OKF Import With Classification

Add an import path that treats an OKF bundle as external content. It must run through classification, provenance capture, duplicate detection, and operator policy before becoming searchable memory.

### OKF-FOLLOWUP-04 - OKF Validator And Round-Trip Fixture

Add a fixture bundle and validation check that proves:

- Exported concept files are conformant.
- Reserved `index.md` and `log.md` are shaped correctly.
- Unknown frontmatter fields round-trip without loss.
- Broken links do not fail import, but are reported.
- Security labels survive export/import when included.

### OKF-FOLLOWUP-05 - Public/Customer Integration Story

Expose OKF as an interoperability claim only after the validator passes. Candidate surfaces:

- README integration section.
- `/llms.txt` or public LLM-readable docs.
- Knowledge Gateway docs.
- Customer-facing export/import demo using non-sensitive sample data.

## Priority

1. Keep v7.2 focused on architecture hardening.
2. Add OKF as a future interoperability requirement group.
3. Implement export before import.
4. Validate on a small non-sensitive fixture before touching live memory.
5. Promote to public positioning only after the validator and sample bundle exist.

## Caveats

- OKF v0.1 is a draft. The roadmap should name the version explicitly and preserve backward-compatible extension behavior.
- OKF is a file format, not a policy system. MemRoOS security and governance must remain the source of truth.
- The best initial implementation is a bridge, not a backend swap.

## Source Links

- Google Cloud blog: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
- OKF spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
- OKF repository directory: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf
- X post: https://x.com/Marie_Haynes/status/2065531158356717721?s=20
