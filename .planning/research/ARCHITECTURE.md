# Architecture Research: v1.2 Feature Integration

**Project:** agent-kitchen
**Milestone:** v1.2 Live Data + Knowledge Sync
**Researched:** 2026-04-11
**Overall Confidence:** HIGH (all findings from direct codebase inspection)

---

## Existing Architecture (Verified)

```
Browser (TanStack Query polling)
  └─ /api/health          → checkService() for RTK, mem0, QMD, Agents, APO
  └─ /api/heartbeat?agent=X → reads ~/github/knowledge/agent-configs/<X>/HEARTBEAT_STATE.md
  └─ /api/knowledge       → reads collections.config.json, stats each basePath on filesystem
  └─ /api/activity        → reads cron/activity logs, produces nodeActivity map
  └─ /api/devtools-status → checks dev tool wiring
  └─ /api/remote-agents   → polls Tailscale/CF agent health endpoints

flow/page.tsx
  → ReactFlowCanvas (receives healthData, activityData, remoteAgents, devToolsStatus)
    → getStatus(nodeId) — decision tree for each node's color
      → "obsidian": hardcoded return "active"
      → "knowledge-curator": hardcoded return "idle"
      → others: nodeActivity[nodeId] minsAgo, or services[] lookup

library/page.tsx
  → useKnowledge() → /api/knowledge
    → reads collections.config.json
    → stats basePath for each collection (doc count, mtime)
```

---

## Feature 1: Live Heartbeat for obsidian + knowledge-curator Nodes

### Integration Point

The hardcoded statuses live in `getStatus()` in `react-flow-canvas.tsx` lines 163–164:

```typescript
if (nodeId === "obsidian") return "active";
if (nodeId === "knowledge-curator") return "idle";
```

These bypass the entire health-check pipeline. Replacing them requires a signal source for each.

### Signal Sources (Verified from Codebase)

**obsidian node** — health signal = filesystem accessibility of `~/github/knowledge/`

The Obsidian vault IS `~/github/knowledge/`. A stat() check on that path (or a sentinel file inside it like `journals/` or `.obsidian/`) returns meaningful health: if stat fails, the vault is unmounted or inaccessible. mtime of `journals/` gives freshness. This is exactly what the existing `/api/health` `Agents` check does (`fsStat(AGENT_CONFIGS_PATH)`) — same pattern.

**knowledge-curator node** — health signal = `/tmp/knowledge-curator.log` age + last line

The cron writes to `/tmp/knowledge-curator.log` (confirmed in healthcheck.sh and the cron header: `>> /tmp/knowledge-curator.log 2>&1`). The last line is `[2026-04-11 03:44:04] Knowledge Curator complete.` The relevant checks are: (a) does the log exist, (b) how old is the last `Knowledge Curator complete` timestamp (should be < 25 hours for a nightly 2am cron), and (c) does the file contain recent warnings.

### Where to Add the Signal

**Option A: Extend `/api/health`** — add two more `checkService()` entries.

Pros: Already consumed by FlowPage, already fed into `getStatus()` via the `svcMap`. The svcMap in `getStatus()` already maps node IDs to service names (`{ gateways: "Agents", notebooks: "mem0", ... }`). Adding `obsidian: "Obsidian"` and `knowledge-curator: "Curator"` to svcMap wires the display with zero changes to flow/page.tsx.

Cons: `/api/health` is a simple up/down check. The curator has richer health semantics (last-run age, step warnings). But returning `"up"` / `"degraded"` / `"down"` is sufficient for the node status colors.

**Option B: New `/api/knowledge-health` route** — richer response (last run time, step results, vault doc count, freshness).

Pros: Can carry metadata that NodeDetailPanel can display when user clicks the node.
Cons: Requires new hook in api-client.ts, new prop threading through FlowPage → ReactFlowCanvas.

**Recommendation: Option A for status colors (extend /api/health), with enriched stats surfaced through the existing nodeStats() callback.**

The `nodeStats()` for `knowledge-curator` already returns `{ Schedule: "nightly 2am", Steps: 5 }`. This can be enriched to include `lastRun` and `status` without any new API route — just read `/tmp/knowledge-curator.log` inside the health check and return additional fields on the HealthStatus object, or compute it in the existing route.

### Data Flow After Fix

```
/api/health (extended)
  → checkService("Obsidian", async () => fsStat("~/github/knowledge"))
  → checkService("Curator", async () => {
      stat /tmp/knowledge-curator.log
      parse last timestamp
      if age > 25h → throw (down)
      if age > 12h → return "degraded"
    })

ReactFlowCanvas.getStatus()
  svcMap: { obsidian: "Obsidian", "knowledge-curator": "Curator", ... }
  → drives node color from services[] array
```

### New vs Modified Components

| Component | Change Type | Notes |
|-----------|-------------|-------|
| `src/app/api/health/route.ts` | MODIFIED | Add 2 checkService() entries |
| `src/components/flow/react-flow-canvas.tsx` | MODIFIED | Add obsidian + knowledge-curator to svcMap, remove hardcoded returns |
| `src/types/index.ts` | POSSIBLY MODIFIED | HealthStatus already has status "up"/"degraded"/"down" — no change needed |

No new files needed for the minimal implementation.

---

## Feature 2: Fix meet-recordings basePath in Library

### Root Cause (Confirmed from Codebase)

`collections.config.json` line 9:
```json
{ "name": "meet-recordings", "basePath": "/Users/yourname/knowledge/gdrive/meet-recordings" }
```

Actual path where `personal-ingestion-transcripts.py` writes:
```python
KNOWLEDGE_ROOT = Path.home() / "github/knowledge"
MEET_DIR = KNOWLEDGE_ROOT / "gdrive" / "meet-recordings"
# → ~/github/knowledge/gdrive/meet-recordings
```

Confirmed both paths exist on disk:
- `~/knowledge/gdrive/meet-recordings/` — has 5 files (older Meet Notes files from Google Drive sync)
- `~/github/knowledge/gdrive/meet-recordings/` — has 105 files (ingestion output)

The Library is showing the wrong path and getting 5 docs instead of 105.

### Fix Location

One-line fix in `collections.config.json`:

```json
{ "name": "meet-recordings", "category": "business", "basePath": "/Users/yourname/github/knowledge/gdrive/meet-recordings" }
```

### Pipeline After Fix

No API route changes needed. `/api/knowledge/route.ts` already reads `col.basePath` from config and stats it. The fix is entirely in config.

Also verify the `alex-docs` and `turnedyellow-admin` entries use `~/knowledge/gdrive/...` paths (not `~/github/knowledge/gdrive/...`). If those paths point to the Google Drive sync folder (not the ingestion output), they may be intentionally different — do not change them without confirming.

### New vs Modified Components

| Component | Change Type | Notes |
|-----------|-------------|-------|
| `collections.config.json` | MODIFIED | Fix meet-recordings basePath (1 line) |

No code changes needed.

---

## Feature 3: KNOW-06 — Bidirectional mem0 ↔ Obsidian Sync

### Current State (One-Way Only)

Existing flows (all one-directional):

```
mem0 → Obsidian:
  mem0-export.sh (Step 3 of knowledge-curator.sh)
  → writes ~/github/knowledge/mem0-exports/<agent>-<date>.md
  → these ARE in the knowledge vault (Obsidian can read them)
  → BUT mem0-exports is not in collections.config.json
     (so Library doesn't show them, and QMD doesn't index them)

Obsidian → mem0:
  NO mechanism exists. The only ingestion scripts are:
  - personal-ingestion-transcripts.py (Meet/Spark → mem0 + Obsidian)
  - personal-ingestion-email.sh (email → Obsidian daily notes)
  Neither reads existing Obsidian notes and pushes them to mem0.
```

### What KNOW-06 Requires

Bidirectional means two separate data flows:

**Direction A: mem0 → Obsidian** (already partially working)

The mem0-export.sh writes markdown files into the knowledge vault. The gap is that these files are not re-indexed into QMD/Qdrant after export. `qmd update` in Step 4 picks them up if they're in a tracked collection. Currently `mem0-exports/` is inside `~/github/knowledge/` which IS the `knowledge` collection root, so they may already be indexed. Confirm: add `mem0-exports` to `collections.config.json` to make it visible in Library.

**Direction B: Obsidian → mem0** (does not exist, needs to be built)

Target documents: Obsidian notes that agents and Luis write that contain information worth remembering across sessions. Candidates:
- `journals/<date>.md` — daily notes with decisions, meetings, tasks
- `projects/<project>/meetings/*.md` — meeting notes from ingestion pipeline
- `shared/PENDING_FACTS.md` — facts routed for distribution
- `shared/CURRENT_PRIORITIES.md` — strategic priorities

These should be pushed to mem0 with `agent_id="shared"` (for cross-agent access) or `agent_id="claude"` for Luis-specific context.

### Required New Components

**New Python script: `~/github/knowledge/obsidian-to-mem0.py`**

Responsible for:
1. Reading a set of target Obsidian files (configured list or glob pattern)
2. Chunking them into meaningful units (paragraphs, headers, bullet groups)
3. Checking against a watermark file (like `ingestion-state.json` pattern) to avoid re-ingesting unchanged content — use mtime or content hash
4. Calling mem0 API (`POST /memory/add`) for each new chunk
5. Writing updated watermarks back to state file

Pattern to follow: `ingestion-state.json` watermark approach (atomic write via `os.replace()`) already established in `personal-ingestion-transcripts.py`.

**Modified `knowledge-curator.sh`**

Add Step 6 (or integrate into Step 3 alongside mem0-export):

```bash
# Step 6 — Obsidian highlights → mem0
log "[6/6] Obsidian → mem0 sync..."
~/github/knowledge/.venv/bin/python3 ~/github/knowledge/obsidian-to-mem0.py || log "  Warning: obsidian-to-mem0 failed (non-fatal)"
```

Non-fatal guard consistent with existing pattern.

### Data Flow

```
DIRECTION A (already exists, confirm coverage):
  mem0 API → mem0-export.sh → ~/github/knowledge/mem0-exports/<agent>-<date>.md
  knowledge-curator.sh Step 4 → qmd update → indexes mem0-exports/
  → Obsidian reads native vault files

DIRECTION B (new):
  ~/github/knowledge/journals/<date>.md
  ~/github/knowledge/projects/*/meetings/*.md
  ~/github/knowledge/shared/PENDING_FACTS.md
    → obsidian-to-mem0.py
      → reads file, extracts chunks
      → checks obsidian-ingestion-state.json (mtime watermark)
      → POST /memory/add to mem0 (agent_id="shared")
      → updates obsidian-ingestion-state.json
    → knowledge-curator.sh Step 6 (nightly 2am)
```

### State File Location

```
~/github/knowledge/obsidian-ingestion-state.json
```

Same directory as existing `ingestion-state.json`, same atomic-write pattern.

### API Shape (mem0 call)

```python
payload = {
    "agent_id": "shared",
    "text": chunk_text,
    "metadata": {
        "source": "obsidian",
        "file": str(relative_path),
        "ingested_at": now_iso
    }
}
requests.post(f"{MEM0_URL}/memory/add", json=payload, timeout=10)
```

`agent_id="shared"` is established convention for cross-agent knowledge. File-specific memories that are Luis-only would use `agent_id="claude"`.

### Deduplication Strategy

mem0 has its own semantic deduplication via Qdrant but it's not guaranteed to catch identical text re-posted across runs. Use mtime watermarking: store `{file_path: mtime_float}` in state file. Only re-ingest if mtime changed. This is cheaper than content hashing and consistent with the existing `ingested_doc_ids` watermark pattern.

### New vs Modified Components

| Component | Change Type | Notes |
|-----------|-------------|-------|
| `~/github/knowledge/obsidian-to-mem0.py` | NEW | Core sync script, Python, ~150-200 lines |
| `~/github/knowledge/knowledge-curator.sh` | MODIFIED | Add Step 6 call to obsidian-to-mem0.py |
| `~/github/knowledge/obsidian-ingestion-state.json` | NEW | Created on first run, not tracked in agent-kitchen |
| `collections.config.json` | MODIFIED | Add mem0-exports entry to make it visible in Library |

No Next.js changes required for KNOW-06. The feature is entirely in the Python/shell layer.

---

## Recommended Build Order

Dependencies flow as follows:

```
Feature 2 (basePath fix) ← No dependencies, 1 line change
Feature 1 (heartbeat)    ← Depends on understanding /api/health pattern (read first)
Feature 3 (KNOW-06)      ← Depends on nothing in the dashboard, standalone pipeline work
```

**Recommended order:**

1. **Feature 2 first** — Single config line change, zero risk, immediately visible in Library (doc count corrects from ~5 to ~105). Confirms understanding of the config pipeline before touching it for KNOW-06.

2. **Feature 1 second** — Extend /api/health, update svcMap, remove hardcoded statuses. Clear test: run the dev server, kill Obsidian, confirm node turns red. Restore, confirm green.

3. **Feature 3 last** — Most work, most moving parts (new Python script, state file, curator integration). Can be built and tested independently from the dashboard. Test by running `obsidian-to-mem0.py` manually, then verifying entries appear in mem0 via `/api/memory?source=claude`.

---

## Pitfalls to Watch

| Area | Risk | Mitigation |
|------|------|------------|
| /api/health timeout | obsidian stat() hangs on network volume | Use `AbortSignal.timeout(2000)` like mem0 check |
| Curator log age check | `/tmp/` cleared on reboot; first run after reboot shows no log | Handle ENOENT → return "down" gracefully, same as heartbeat route pattern |
| Obsidian → mem0 chunk size | mem0 has implicit token limits per memory | Chunk by paragraph or heading section, max ~500 chars per chunk |
| meet-recordings dual path | `~/knowledge/gdrive/` still exists — don't delete it | Only update collections.config.json; the other path may be Google Drive sync mount |
| mem0-exports not in Library | Already written to vault but invisible | Add to collections.config.json as "agents" category |
| KNOW-06 re-ingestion | journals grow daily; re-ingesting unchanged days wastes API calls | mtime watermark prevents this; only new or modified files get re-processed |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Heartbeat integration point | HIGH | Direct code inspection of getStatus(), hardcoded lines confirmed |
| basePath fix root cause | HIGH | Both paths confirmed on filesystem, Python script KNOWLEDGE_ROOT traced |
| /api/health extension pattern | HIGH | checkService() pattern is clean and consistent |
| KNOW-06 data flow | HIGH | mem0-export.sh, ingestion-state.json pattern, mem0 API shape all verified |
| obsidian-to-mem0.py scope | MEDIUM | Logic is straightforward; mem0 semantic dedup behavior under load not tested |
