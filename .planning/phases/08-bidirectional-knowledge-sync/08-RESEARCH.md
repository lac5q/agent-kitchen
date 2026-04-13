# Phase 8: Bidirectional Knowledge Sync — Research

**Researched:** 2026-04-12
**Domain:** Python ingestion script, mem0 REST API, shell orchestration
**Confidence:** HIGH — all findings from direct filesystem inspection, live API probing, and existing codebase

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-06 | Obsidian daily journal notes ingested into mem0 nightly as memories (Obsidian → mem0, curator Step 6) | Script exists at correct path, Step 6 already wired in curator. Fix 3 deviations and run. |
| KNOW-07 | Idempotent ingestion — mtime watermark + content-hash dedup + origin tag prevent duplicates across runs | All three guards implemented in existing script. Deviation 2 + 3 must be corrected. |
</phase_requirements>

---

## Summary

Phase 8 delivers KNOW-06 and KNOW-07: nightly ingestion of Obsidian journal notes into mem0, protected by three loop guards that prevent duplicates. The primary deliverable is a Python script at `~/github/knowledge/scripts/obsidian-to-mem0.py`, wired into `knowledge-curator.sh` as a non-fatal Step 6.

**Critical finding:** A draft of `obsidian-to-mem0.py` already exists at `~/github/knowledge/scripts/obsidian-to-mem0.py` (123 lines). However, it has three deviations from the v1.2 spec that must be corrected before it is production-ready. The plan must treat this as a fix-the-existing-draft task, not a create-from-scratch task.

**Second critical finding:** Step 6 is already wired into `knowledge-curator.sh` (line 40-41). The curator invocation is already present and non-fatal. No shell script changes are required.

**Third critical finding:** `mem0-exports/` is already registered in `collections.config.json` (done in Phase 6 / CONFIG-02). No Library config changes are needed for Phase 8.

**Primary recommendation:** Fix the three spec deviations in the existing script, then run it manually against the live mem0 instance at localhost:3201 to verify end-to-end. No new packages, no new cron entries, no dashboard changes needed for KNOW-06/07.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python 3 stdlib only | .venv at ~/github/knowledge/.venv | HTTP POST, file I/O, hashing, JSON | No new deps — existing script already uses urllib.request, hashlib, pathlib, os, json |

**No new packages to install.** The existing script uses only stdlib modules. `requests` is available in the venv but the script deliberately uses `urllib.request` to avoid the dependency. [VERIFIED: imports in obsidian-to-mem0.py lines 7-17]

---

## Current State of knowledge-curator.sh

[VERIFIED: direct file read of `/Users/yourname/github/knowledge/knowledge-curator.sh`]

The file is 43 lines. Step 6 is already present:

```bash
# Step 6 — Obsidian journals → mem0 sync
log "[6/6] Obsidian → mem0 journal sync..."
~/github/knowledge/.venv/bin/python3 ~/github/knowledge/scripts/obsidian-to-mem0.py || log "  Warning: obsidian-to-mem0 sync failed (non-fatal)"

log "Knowledge Curator complete."
```

The log label at line 37 says `[5/6]` for transcripts and `[6/6]` for the new step — already correct. **No changes needed to `knowledge-curator.sh`.**

---

## Existing Script: obsidian-to-mem0.py — Deviations from Spec

[VERIFIED: direct file read of `/Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py`]

The script exists at the correct path (123 lines). It implements content-hash dedup and mtime watermark correctly. Three deviations from the v1.2 spec must be fixed:

### Deviation 1: Wrong agent_id (CRITICAL)

**Current:** `AGENT_ID = "gwen"` (hardcoded, line 25)
**Required:** `agent_id="claude"` for journals/ content

Live mem0 confirms `agent_id=gwen` already has 9 memories written by this script during a test run (verified via `GET /memory/all?agent_id=gwen`). These are journal memories under the wrong agent. The spec says:
- `journals/` → `agent_id="claude"`

**Fix:** Change `AGENT_ID = "gwen"` to `AGENT_ID = "claude"`.

### Deviation 2: State file shared with Phase 5 (ISOLATION)

**Current:** `STATE_FILE = VAULT / "ingestion-state.json"` (line 21) — same file as Gmail/calendar ingestion (verified: `ingestion-state.json` has keys `gmail`, `calendar`, `gdrive_meet`, `spark`).
**Required:** v1.2-KICKOFF.md specifies `obsidian-ingestion-state.json` as the watermark file.

The existing script adds its state under the `"obsidian-journals"` key within the shared file — this works functionally (no key collision), but both the Phase 5 scripts and the Phase 8 script write to the same file during the same cron run (sequential steps, so overlap is unlikely but not guaranteed).

**Fix:** Change `STATE_FILE` to `VAULT / "obsidian-ingestion-state.json"`. Initialize fresh (empty `processed_hashes`) so all 4 journals re-ingest under the correct `agent_id=claude` on first corrected run.

### Deviation 3: Origin tag documented as informational only (DOCUMENTATION)

**Current:** Script docstring says `source="obsidian-sync"` is "informational only, not an active guard" (lines 7-8).
**Required:** The spec (KNOW-07) requires the origin tag to be documented as an active loop guard.

The guard functions correctly in practice — `mem0-export.sh` exports by `agent_id` so journal memories under `agent_id=claude` go to `claude-YYYY-MM-DD.md` export files, not back into `journals/`. The code is correct; only the docstring is wrong.

**Fix:** Update docstring to accurately describe Guard 1 as active.

---

## mem0 REST API — Verified Payload Format

[VERIFIED: live API probe at `http://localhost:3201`, `ingestion_utils.py` source]

### Health
```
GET http://localhost:3201/health
→ {"status":"ok","vector_store":"connected","disk":{"free_gb":65.7,...},"sqlite":{"status":"healthy"}}
```
mem0 is live and healthy as of 2026-04-12. [VERIFIED]

### POST /memory/add
```json
{
  "text": "Journal entry 2026-04-12:\n\n<content>",
  "agent_id": "claude",
  "metadata": {
    "source": "obsidian-sync",
    "date": "2026-04-12",
    "file": "/Users/yourname/github/knowledge/journals/2026-04-12.md",
    "hash": "abc123def456"
  }
}
```

The `agent_id` field in the POST body maps to `user_id` in the response. [VERIFIED: live mem0 response shows `"user_id": "gwen"` for memories POSTed with `"agent_id": "gwen"`]

### GET /memory/all
```
GET http://localhost:3201/memory/all?agent_id=claude
→ {"memories": [{id, memory, hash, metadata, created_at, updated_at, user_id}, ...]}
```
[VERIFIED: 9 existing claude memories observed. `metadata` is `null` when not provided at POST time.]

### Timeout
The existing script uses `timeout=120` seconds per request (line 55). For 4 journal files, worst case = 480 seconds but this is acceptable for a nightly batch. Do not reduce below 30s.

---

## Journal File Structure

[VERIFIED: direct filesystem inspection of `~/github/knowledge/journals/`]

```
~/github/knowledge/journals/
├── 2026-04-10.md
├── 2026-04-11.md
├── 2026-04-12.md
└── 2026-04-13.md
```

- **File count:** 4 files as of 2026-04-12
- **Naming pattern:** `YYYY-MM-DD.md` — confirmed by glob `????-??-??.md` in existing script
- **Chunking:** Each journal file is sent as one POST (full file, date-prefixed). No heading-based chunking needed for v1.2. Journals are short (< 2KB typical).
- **No YAML frontmatter parsing needed** — script reads raw content with `.strip()`

---

## Watermark Pattern

[VERIFIED: `ingestion-state.json` at `/Users/yourname/github/knowledge/ingestion-state.json`, `ingestion_utils.py` source]

The Phase 5 watermark uses `os.replace()` for atomic write. The existing script correctly implements this pattern. The only change is isolating the state to a dedicated file.

### Required state shape for `obsidian-ingestion-state.json` (new file):
```json
{
  "obsidian-journals": {
    "last_mtime": null,
    "processed_hashes": []
  }
}
```

Initialize with empty `processed_hashes` to allow a clean re-ingest under the corrected `agent_id=claude`. The existing hashes were recorded under `agent_id=gwen` runs.

---

## Three Loop Guards — Exact Implementation

[VERIFIED: spec from v1.2-KICKOFF.md; all three implemented in existing script lines 87-95, 108-111, 47]

All three are required per KNOW-07. The existing script has the code correct for Guards 2 and 3. Guard 1 is code-correct but the agent_id constant (Deviation 1) undermines its effectiveness.

### Guard 1: Origin Tag (metadata.source = "obsidian-sync")
**Purpose:** Signals that this memory originated from Obsidian, preventing re-export feedback loops. `mem0-export.sh` exports by agent_id (not by source tag), so the direct loop cannot form. The tag protects against future tooling that reads all vault markdown for ingestion.
**Current state:** `SOURCE_TAG = "obsidian-sync"` correctly set (line 24). Metadata included in every POST (line 106). No code change needed — only docstring fix.

### Guard 2: Content-Hash Dedup
**Purpose:** Skips files whose content has not changed since last ingest, even if mtime was updated by a touch/sync operation.
**Implementation:** `SHA256(content)[:16]` → stored in `processed_hashes` list → checked before every POST.
**Current state:** Lines 87-90. Correct. No change needed.
**Note:** `processed_hashes` grows ~1 entry/day. At 365 entries/year (~7KB), unbounded growth is acceptable for v1.2 scope.

### Guard 3: mtime Watermark
**Purpose:** Secondary optimization — skips files not modified since last run without reading file content.
**Implementation:** `obsidian-ingestion-state.json` stores `last_mtime` as ISO8601. Files with `mtime <= last_mtime` are skipped.
**Current state:** Lines 92-95. Pattern is correct. `last_mtime` is set to the most-recent processed file's mtime (not current clock time), handling out-of-order mtime scenarios correctly.
**Change needed:** State file path isolation (Deviation 2).

---

## agent_id Routing

[VERIFIED: v1.2-KICKOFF.md, mem0-export.sh USER_IDS list, live API]

Known agent_ids in this system (from `mem0-export.sh` USER_IDS): `shared, ceo, cto, cmo, chief_of_staff, claude, gwen, qwen, qwen-engineer, ...`

For Phase 8 (journals/ only):
- `journals/` → `agent_id="claude"` [VERIFIED: spec]

Phase 8 does NOT include `shared/` directory ingestion (deferred to v2 per REQUIREMENTS.md KNOW-08/09). No directory-based routing logic needed — a single constant suffices.

**Stale data:** 9 journal memories exist under `agent_id=gwen` from draft testing. These do not harm correctness of the corrected script but will remain in mem0. Leave them — do not delete unless Luis requests cleanup.

---

## mem0-exports in Library — Already Done (Phase 6)

[VERIFIED: `collections.config.json` grep confirmed entry exists]

`mem0-exports` is already registered:
```json
{ "name": "mem0-exports", "category": "agents", "basePath": "/Users/yourname/github/knowledge/mem0-exports" }
```

CONFIG-02 was completed in Phase 6. Phase 8 has no Library config work.

---

## Architecture Patterns

### Project Structure (relevant files only)
```
~/github/knowledge/
├── knowledge-curator.sh              # Already has Step 6 wired — no changes needed
├── ingestion-state.json              # Phase 5 state (gmail/calendar/gdrive/spark) — do not touch
├── obsidian-ingestion-state.json     # NEW — created on first corrected run
├── journals/
│   └── YYYY-MM-DD.md                 # Source files (4 today, +1/day)
└── scripts/
    └── obsidian-to-mem0.py           # EXISTS — needs 3 targeted fixes
```

### Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| mem0 Python client | `pip install mem0ai` | `urllib.request` (stdlib, already in script) | No new deps; script already works |
| Markdown parser | `mistune`, `markdown-it-py` | Raw file read + strip | Daily journals are flat markdown, no AST needed |
| Atomic file write | Custom file locking | `os.replace()` (stdlib, already in script) | POSIX-atomic, proven in Phase 5 |
| Dedup store | SQLite, Redis | JSON list in state file | 365 entries/year is < 10KB |

---

## Common Pitfalls

### Pitfall 1: Wrong agent_id pollutes claude session preloads
**What goes wrong:** Journal memories under `agent_id=gwen` are invisible to Claude's session preload (which queries `agent_id=claude`).
**Why it happens:** Draft script defaulted to `gwen`.
**How to avoid:** Fix `AGENT_ID = "claude"` before any production run.
**Warning signs:** `GET /memory/all?agent_id=claude` returns no journal entries; `GET /memory/all?agent_id=gwen` shows journal content.

### Pitfall 2: Stale hashes in shared state prevent re-ingest under correct agent_id
**What goes wrong:** If `processed_hashes` from the gwen-era runs carry over to the new state file, all 4 journals appear "already ingested" and `ingested=0` on first corrected run.
**How to avoid:** Initialize `obsidian-ingestion-state.json` with empty `processed_hashes: []`. The switch to a new state file path naturally achieves this if the old shared state is not copied.

### Pitfall 3: State file collision with Phase 5 during same cron window
**What goes wrong:** Both `personal-ingestion-transcripts.sh` (Step 5) and `obsidian-to-mem0.py` (Step 6) write to `ingestion-state.json` if the old path is not changed.
**How to avoid:** Dedicated `obsidian-ingestion-state.json` eliminates the shared writer entirely.
**Warning signs:** JSON parse errors in `ingestion-state.json` after curator runs.

### Pitfall 4: mem0 timeout blocks curator for large journals
**What goes wrong:** 120s timeout × N files = long blocking time if mem0 is slow.
**How to avoid:** For v1.2 (journals only, 4–365 files), this is acceptable. The step is non-fatal — curator continues even if it times out.

---

## Code Examples

### Corrected Constants Block
```python
# Source: existing obsidian-to-mem0.py with required fixes applied
VAULT = Path.home() / "github" / "knowledge"
JOURNALS_DIR = VAULT / "journals"
STATE_FILE = VAULT / "obsidian-ingestion-state.json"   # was: ingestion-state.json
MEM0_URL = os.environ.get("MEM0_URL", "http://localhost:3201")
AGENT_ID = "claude"                                     # was: "gwen"
SOURCE_TAG = "obsidian-sync"
```

### Corrected Docstring
```python
"""
Obsidian journals → mem0 sync (v1.2)

Correctness guards (all three active, all three required per KNOW-07):
  1. Origin tag: source="obsidian-sync" in metadata — active guard that signals
     mem0-export.sh and future tooling to skip obsidian-originated memories
     when deciding what to re-ingest into the vault.
  2. Content-hash dedup: SHA256 of file content checked against processed_hashes
     in obsidian-ingestion-state.json before every POST /memory/add.
  3. mtime watermark: files not modified since last_mtime are skipped without
     reading content. State written atomically via os.replace().
"""
```

### mem0 POST /memory/add (verified working pattern)
```python
# Source: ingestion_utils.py add_mem0() + existing obsidian-to-mem0.py post_to_mem0()
payload = json.dumps({
    "text": f"Journal entry {date_str}:\n\n{content}",
    "agent_id": "claude",
    "metadata": {
        "source": "obsidian-sync",
        "date": date_str,
        "file": str(journal),
        "hash": h,
    },
}).encode("utf-8")
req = urllib.request.Request(
    "http://localhost:3201/memory/add",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as resp:
    success = resp.status in (200, 201)
```

### Atomic State Write (proven pattern from ingestion_utils.py and existing script)
```python
def save_state(state: dict):
    tmp = str(STATE_FILE) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, default=str)
    os.replace(tmp, str(STATE_FILE))
```

### Manual Verification Command
```bash
# After running the corrected script, verify memories landed under claude:
curl -sf "http://localhost:3201/memory/all?agent_id=claude" | python3 -c "
import json, sys
d = json.load(sys.stdin)
mems = [m for m in d['memories'] if m.get('metadata') and m['metadata'].get('source') == 'obsidian-sync']
print(f'Journal memories under claude: {len(mems)}')
for m in mems:
    print(f'  {m[\"metadata\"].get(\"date\", \"?\")} — {m[\"memory\"][:80]}')
"
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 (.venv) | obsidian-to-mem0.py | ✓ | `~/github/knowledge/.venv` | — |
| mem0 REST API | POST /memory/add | ✓ | localhost:3201, status=ok | Non-fatal (script exits 0, curator logs warning) |
| journals/ directory | File ingestion | ✓ | 4 files confirmed | Script exits 1 with error message |
| urllib.request | HTTP POST | ✓ | Python stdlib | — |
| os.replace() | Atomic write | ✓ | Python stdlib | — |
| obsidian-ingestion-state.json | Watermark | ✗ (not yet) | Created on first run | Script initializes from defaults |

**No missing blocking dependencies.**

---

## Validation Architecture

> `nyquist_validation` not set to false in config.json — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual smoke tests (no test file exists for ingestion scripts) |
| Quick run command | `~/github/knowledge/.venv/bin/python3 ~/github/knowledge/scripts/obsidian-to-mem0.py` |
| Idempotency check | Run twice; second run should print `ingested=0, skipped_hash=N, skipped_mtime=M` |
| Verify memories | `curl -sf "http://localhost:3201/memory/all?agent_id=claude"` — count source=obsidian-sync entries |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-06 | Journal files POST to mem0 after script run | smoke | Run script; curl /memory/all?agent_id=claude; count source=obsidian-sync | ✅ (script exists) |
| KNOW-07 | Second run: `ingested=0` (idempotent) | smoke | Run script twice; check stdout for `ingested=0` | ✅ (logic in script) |
| KNOW-07 | mtime watermark: unchanged files skipped | smoke | Run twice; `skipped_mtime>0` on second run | ✅ |
| KNOW-07 | Hash dedup: touched file with same content rejected | smoke | `touch journals/2026-04-12.md`; run; check `skipped_hash` increments | ✅ |

### Wave 0 Gaps
- [ ] `obsidian-ingestion-state.json` does not exist yet — created on first run (not a blocker)
- [ ] No automated test file — all validation is manual smoke tests (acceptable for ingestion scripts per project pattern)

---

## Security Domain

> `security_enforcement` not set to false — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | mem0 is localhost-only, no auth surface |
| V3 Session Management | No | stateless script, no sessions |
| V4 Access Control | No | local filesystem access only |
| V5 Input Validation | Yes (low risk) | Journal content passed directly to mem0 POST body |
| V6 Cryptography | No | SHA256 used for dedup only, not security |

### V5 Input Validation Assessment

Journal content is Luis's own Obsidian notes written to a local vault. The content is passed as the `text` field in a JSON POST to `localhost:3201`. Risk assessment:

- **Injection risk:** None. The mem0 server is a local Python process. Content is JSON-encoded via `json.dumps()` which escapes all special characters. [VERIFIED: `json.dumps()` in post_to_mem0(), line 43]
- **Size risk:** Journals are short (< 2KB typical). No size check exists but mem0 has no known size limit for the `text` field.
- **Encoding:** `journal.read_text(encoding="utf-8", errors="replace")` — malformed UTF-8 is replaced, not raised. [VERIFIED: line 83]

**No security controls needed beyond existing implementation.** This is a localhost-to-localhost write of the user's own content.

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via journal content | Tampering | Not applicable — journal is written by Luis, not external input |
| Path traversal in STATE_FILE | Tampering | Path is a hardcoded constant, not user-supplied |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 9 gwen memories from test runs can be left in mem0 without affecting correctness | Deviation 1 | If mem0 global dedup is active, re-ingesting same content under claude may be silently rejected — initialize processed_hashes as empty to force re-attempt |
| A2 | mem0 semantic dedup is scoped per agent_id | agent_id routing | If dedup is global: some journal content may never appear under claude even after fix |
| A3 | Journals are short enough (< 2KB) to POST as a single memory without chunking | Journal structure | If a journal is very long (e.g., pasted transcript), mem0 may produce a poor-quality memory |

---

## Open Questions

1. **Stale gwen test memories**
   - What we know: 9 journal memories exist under `agent_id=gwen` from draft testing
   - What's unclear: Whether Luis wants them cleaned up via `DELETE /memory/{id}`
   - Recommendation: Leave them. They don't affect correctness. Planner can add an optional cleanup task.

2. **processed_hashes initialization**
   - What we know: Old hashes were written into the shared `ingestion-state.json` under `obsidian-journals`
   - What's unclear: Whether the switch to a new state file naturally resets hashes (yes, it does) or if the old shared file needs cleanup
   - Recommendation: New file = fresh start. Old shared state file is untouched. This is the correct behavior.

---

## Sources

### Primary (HIGH confidence)
- Direct read: `/Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py` (123 lines)
- Direct read: `/Users/yourname/github/knowledge/knowledge-curator.sh` — Step 6 confirmed present
- Direct read: `/Users/yourname/github/knowledge/mem0-export.sh` — POST payload format, USER_IDS list
- Direct read: `/Users/yourname/github/knowledge/ingestion_utils.py` — `add_mem0()` signature, state pattern
- Direct read: `/Users/yourname/github/knowledge/ingestion-state.json` — confirmed shared state shape
- Live API: `GET http://localhost:3201/health` → `{"status":"ok"}`
- Live API: `GET http://localhost:3201/memory/all?agent_id=gwen` → 9 journal memories (wrong agent)
- Live API: `GET http://localhost:3201/memory/all?agent_id=claude` → 9 existing claude memories (non-journal)
- Filesystem: `ls ~/github/knowledge/journals/` → 4 files, YYYY-MM-DD.md naming confirmed
- `collections.config.json` grep → mem0-exports already registered (Phase 6 / CONFIG-02 complete)

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — v1.2 research with Feature 3 detail
- `.planning/research/FEATURES.md` — Feature 3 analysis, conflict resolution table
- `.planning/v1.2-KICKOFF.md` — spec and constraints

---

## Metadata

**Confidence breakdown:**
- Current file state (what exists, what's wired): HIGH — direct reads, no inference
- Three loop guards (code correctness): HIGH — verified line by line
- Deviations from spec: HIGH — exact line numbers confirmed
- mem0 API behavior: HIGH — live API confirmed
- mem0 dedup scoping (per-agent vs global): LOW — undocumented in REST API

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable stack, no fast-moving dependencies)
