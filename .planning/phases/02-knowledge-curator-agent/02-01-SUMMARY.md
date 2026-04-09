---
phase: 02-knowledge-curator-agent
plan: 01
subsystem: knowledge-curator
tags: [qdrant, gemini-embeddings, mem0, shell-scripts, vector-indexing]
dependency_graph:
  requires: [01-01]
  provides: [llm-wiki-process.sh, mem0-export.sh, qdrant-indexer.py, mem0-exports/]
  affects: [02-02-PLAN.md (orchestrator)]
tech_stack:
  added: []
  patterns:
    - "Gemini models/gemini-embedding-2-preview (3072 dims) via google-genai 1.67.0 SDK"
    - "Qdrant Cloud upsert with stable hash-based IDs for idempotent re-runs"
    - "mem0 REST API client-side date filtering (created_at prefix match)"
    - "set -a / set +a env loading pattern for .env without export prefix"
key_files:
  created:
    - ~/github/knowledge/llm-wiki-process.sh
    - ~/github/knowledge/mem0-export.sh
    - ~/github/knowledge/qdrant-indexer.py
  modified: []
decisions:
  - "llm-wiki processing remains manual (check-only + warn); no automation attempted per GETTING-STARTED.md"
  - "mem0-export.sh uses client-side date filtering (created_at prefix) — no server-side date filter in mem0 API"
  - "qdrant-indexer.py indexes 5 paths: 4 basePath collections from collections.config.json + mem0-exports"
  - "Excluded dirs: node_modules, .git, .venv, __pycache__ — prevents indexing build artifacts"
  - "Chunk size 1000 chars with 100-char overlap — conservative for Gemini token limits"
  - "assert COLLECTION != 'agent_memory' guard prevents accidental mem0 corruption"
metrics:
  duration: "111 seconds"
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_created: 3
---

# Phase 02 Plan 01: Knowledge Curator Scripts Summary

**One-liner:** Three foundational Knowledge Curator scripts — llm-wiki raw file checker, mem0 daily highlights exporter, and Gemini-embedding Qdrant Cloud indexer for 5 markdown collections.

## What Was Built

### Task 1: llm-wiki-process.sh + mem0-export.sh (commit e7756d8)

**llm-wiki-process.sh** (`~/github/knowledge/llm-wiki-process.sh`):
- Checks `llm-wiki/raw/` for unprocessed `.md` files (maxdepth 1, excludes .DS_Store)
- Warns: `"WARNING: N unprocessed files in llm-wiki/raw/ — ask Alba to process"` and lists files
- If empty: `"llm-wiki/raw/ is empty — nothing to process"`
- Does NOT attempt to process files — manual-only per GETTING-STARTED.md

**mem0-export.sh** (`~/github/knowledge/mem0-export.sh`):
- Exports yesterday's mem0 memories to `~/github/knowledge/mem0-exports/`
- Calls `GET /memory/all?agent_id={uid}` for all 17 known user_ids
- Filters by `created_at` prefix (ISO date string) — client-side, no server date filter in mem0
- Output: `{uid}-{YYYY-MM-DD}.md` with header `# mem0 Highlights: {uid} — {date}` + bullet list
- Idempotent: skips existing files; cleans up empty/failed outputs
- macOS/Linux portable date command with fallback

### Task 2: qdrant-indexer.py (commit bc99d10)

**qdrant-indexer.py** (`~/github/knowledge/qdrant-indexer.py`):
- Shebang: `#!/Users/yourname/github/knowledge/.venv/bin/python3`
- Safety guard: `assert COLLECTION != "agent_memory"` — prevents accidental mem0 corruption
- `ensure_collection()`: creates `knowledge_docs` if absent, no-op if exists (idempotent)
- `chunk_text()`: sliding window, 1000 chars / 100 overlap
- `embed()`: calls `genai_client.models.embed_content(model=EMBED_MODEL, contents=text)` — `resp.embeddings[0].values`
- `stable_id()`: SHA256 of `"{filepath}:{chunk_idx}"`, first 16 hex chars as int — deterministic point IDs
- `index_paths()`: walks 5 dirs, excludes `{node_modules, .git, .venv, __pycache__}`, skips unreadable files, rate-limits with `time.sleep(0.1)`, retries embed once with 2s backoff
- Upserts batched per file with payload: `{file, collection, chunk_index, text[:500]}`
- Prints final point count from `get_collection()`

**5 paths indexed:**
1. `~/github/agent-lightning` (agent-lightning basePath)
2. `~/github/agent-lightning/docs` (agent-lightning-docs basePath)
3. `~/github/knowledge/llm-wiki/wiki` (llm-wiki basePath)
4. `~/github/knowledge` (knowledge basePath)
5. `~/github/knowledge/mem0-exports` (mem0 export output)

## Verification Results

All acceptance criteria passed:

| Check | Result |
|-------|--------|
| `bash -n llm-wiki-process.sh` | PASS |
| `bash -n mem0-export.sh` | PASS |
| `python3 -m py_compile qdrant-indexer.py` | PASS |
| `grep -c "WARNING" llm-wiki-process.sh` | 1 |
| `grep -c "ask Alba" llm-wiki-process.sh` | 1 |
| `grep -c "mem0-exports" mem0-export.sh` | 2 |
| `grep -c "localhost:3201" mem0-export.sh` | 1 |
| All 17 user_ids present in mem0-export.sh | PASS |
| Both scripts mode 755 | PASS |
| `grep -c "knowledge_docs" qdrant-indexer.py` | 3 |
| `grep -c "agent_memory" qdrant-indexer.py` | 1 (assert only) |
| `grep "qmd embed"` across all scripts | NO MATCH (forbidden) |
| `grep -c "embed_content"` | 1 |
| `grep -c "time.sleep"` | 2 |
| `grep -c "mem0-exports"` in indexer | 2 |
| `grep -c "node_modules"` exclusion | 1 |

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1: llm-wiki-process.sh + mem0-export.sh | `e7756d8` | `llm-wiki-process.sh`, `mem0-export.sh` |
| 2: qdrant-indexer.py | `bc99d10` | `qdrant-indexer.py` |

Both commits in `~/github/knowledge/` (master branch).

## Deviations from Plan

None — plan executed exactly as written.

The only implementation detail not explicitly specified was the inline Python argument passing for `uid` in `mem0-export.sh` (the plan showed `$uid` in an f-string but `sys.argv[2]` is the correct approach for shell-to-python variable passing in an inline script). This was auto-resolved without changing behavior.

## Threat Model Compliance

All T-02-0x mitigations applied:

| Threat ID | Status |
|-----------|--------|
| T-02-01: QDRANT_API_KEY hardcoded | MITIGATED — reads from `os.environ["QDRANT_API_KEY"]` |
| T-02-02: GEMINI_API_KEY hardcoded | MITIGATED — `genai.Client()` reads automatically from env |
| T-02-03: Accidental agent_memory write | MITIGATED — `assert COLLECTION != "agent_memory"` |
| T-02-04: Gemini rate limit DoS | MITIGATED — `time.sleep(0.1)` + 2s retry backoff |
| T-02-05: mem0 HTTP (localhost) | ACCEPTED — local-only service, no PII leaves machine |
| T-02-06: mem0 no auth | ACCEPTED — read-only GET, local service |

## Known Stubs

None. All scripts are fully wired:
- `llm-wiki-process.sh`: reads live filesystem
- `mem0-export.sh`: calls live mem0 REST API at localhost:3201
- `qdrant-indexer.py`: connects to live Qdrant Cloud, uses live Gemini API

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `llm-wiki-process.sh` exists | FOUND |
| `mem0-export.sh` exists | FOUND |
| `qdrant-indexer.py` exists | FOUND |
| `02-01-SUMMARY.md` exists | FOUND |
| commit `e7756d8` exists | FOUND |
| commit `bc99d10` exists | FOUND |
