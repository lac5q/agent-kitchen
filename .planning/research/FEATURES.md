# Features Research: v1.2 Live Data + Knowledge Sync

**Domain:** Observability dashboard for AI agent infrastructure
**Researched:** 2026-04-11
**Overall confidence:** HIGH — all three features grounded in first-party codebase inspection and actual pipeline logs

---

## Feature 1: Live Heartbeat for Obsidian + knowledge-curator Flow Nodes

### Current State (verified)

The `getStatus()` function in `react-flow-canvas.tsx` has two hardcoded lines:

```typescript
if (nodeId === "obsidian") return "active";
if (nodeId === "knowledge-curator") return "idle";
```

Every other node derives status from `nodeActivity` (minutes-since-last-activity) or the `services` health array. These two nodes are the only ones that never reflect real state.

### What "Healthy" Looks Like for Each Node

**Obsidian (the filesystem vault at `~/github/knowledge/`)**

Obsidian is a passive vault — it has no running process to ping. "Healthy" means the vault has been written to recently. Ground-truth signals, verified against the actual filesystem:

| Signal | Healthy | Stale | Dead |
|--------|---------|-------|------|
| `~/github/knowledge/journals/YYYY-MM-DD.md` mtime | exists today | exists yesterday | missing >1 day |
| Directory mtime of `~/github/knowledge/` | < 24h ago | 24–48h ago | > 48h ago |
| mem0-exports dir has today's date files | present | absent | absent + previous also missing |
| `.obsidian/workspace.json` mtime | < 12h (active user) | 12–48h (not opened) | > 48h |

Recommended primary signal: whether today's journal file exists at `~/github/knowledge/journals/YYYY-MM-DD.md`. This is written by the personal ingestion pipeline whenever emails/transcripts arrive, so its absence is meaningful. Secondary: directory mtime for the vault root.

**knowledge-curator (the cron at `0 2 * * * knowledge-curator.sh`)**

The curator is a nightly shell script. Its ground-truth signals are the log file and the mem0-exports output:

| Signal | Healthy | Warning | Dead |
|--------|---------|---------|------|
| `/tmp/knowledge-curator.log` contains today's "Knowledge Curator complete." | yes | yesterday's date | no entry within 26h |
| mem0-exports has files dated yesterday | yes (run completed) | stale by 2 days | absent |
| Log contains any "Warning:" lines | 0 warnings | 1–2 warnings (non-fatal) | all 5 steps warned |
| Last log timestamp vs now | < 26h (cron runs at 2am) | 26–50h | > 50h |

Recommended primary signal: parse the last "Starting Knowledge Curator..." timestamp from `/tmp/knowledge-curator.log`. If `now - lastRun > 26h`, status is `idle` (missed a run). If `> 50h`, status is `error`. If last run contains no "Warning:" lines, status is `active`.

### Table Stakes Behaviors

| Behavior | Why Required | Complexity |
|----------|--------------|------------|
| Obsidian shows `active` if today's journal file exists | Vault is live | Low — one `stat()` call |
| Obsidian shows `stale` if last journal is yesterday | Missing day's ingestion | Low |
| Obsidian shows `error` if no journal in 48h+ | Pipeline has failed | Low |
| knowledge-curator shows `active` if ran within 26h, no warnings | Healthy nightly run | Low — parse last log timestamp |
| knowledge-curator shows `idle` if ran within 26h with warnings | Non-fatal step failures | Low |
| knowledge-curator shows `error` if last run > 26h ago | Missed cron | Low |

### Differentiators

| Behavior | Value | Complexity |
|----------|-------|------------|
| Show time-since-last-run in node subtitle (e.g., "ran 6h ago") | At-a-glance pipeline health | Low — already have subtitle field |
| Show warning count in tooltip/panel for curator | Surfaces partial failures | Low — grep log for "Warning:" count |
| Show doc count delta (today vs yesterday) for Obsidian | Shows vault growth | Medium — requires two stat calls |

### Anti-Features / Scope Boundaries

| Anti-Feature | Why Avoid |
|--------------|-----------|
| Spawning a process to check Obsidian's internal state | Obsidian has no health API; filesystem signals are sufficient |
| Polling the log file more than once per minute | Log is append-only, polling interval is already dashboard-wide |
| Alerting/notification system | Out of scope for v1.2; dashboard is read-only |
| Checking `qmd embed` status | Forbidden per architecture decisions |

### Dependencies on Existing Features

- `getStatus()` in `react-flow-canvas.tsx` — direct modification of the two hardcoded lines
- A new `/api/knowledge-status` route (or extending `/api/knowledge`) to do the `stat()` checks and log parsing server-side (client cannot access filesystem)
- The existing heartbeat polling loop (TanStack Query) can carry this — no new polling needed
- Constants file already has `AGENT_CONFIGS_PATH` pattern — similar pattern for `KNOWLEDGE_BASE_PATH`

---

## Feature 2: Fix meet-recordings basePath Divergence

### Root Cause (verified)

Two separate directories exist on disk:

| Path | Files | Used by |
|------|-------|---------|
| `~/knowledge/gdrive/meet-recordings/` | 105 files | `collections.config.json` basePath |
| `~/github/knowledge/gdrive/meet-recordings/` | 100 files | `personal-ingestion-transcripts.py` MEET_DIR |

The ingestion script hardcodes `KNOWLEDGE_ROOT = Path.home() / "github/knowledge"` and writes new transcripts to `~/github/knowledge/gdrive/meet-recordings/`. The Library view reads from `collections.config.json` which points to `~/knowledge/gdrive/meet-recordings/` — a different directory that is no longer receiving new files.

Result: Library shows 105 docs (the stale path), new transcripts accumulate at the `github/knowledge` path invisibly, and the two paths will diverge further with every nightly run.

### Table Stakes Behaviors

| Behavior | Why Required | Complexity |
|----------|--------------|------------|
| Library `meet-recordings` card shows live file count from the path where new files are actually written | Correctness — 5 files are already invisible | Low — one-line config change |
| Config change is in `collections.config.json` (not hardcoded) | Config-driven is the existing pattern | Low |
| Path resolution validates the target directory exists at startup | Surfaces misconfiguration early | Low — already handled by the `catch` in `knowledge/route.ts` which returns `docCount: 0` |

### How Config-Driven Path Resolution Works in This Codebase

The existing pattern (verified in `knowledge/route.ts`):

1. `collections.config.json` is the single source of truth for `basePath`
2. The API reads it at request time (no caching, `force-dynamic`)
3. If `basePath` does not exist on disk, the API returns `docCount: 0` and `lastUpdated: null` gracefully
4. No validation of path correctness at config load time — a mismatched path just silently shows 0 docs

The fix requires updating `collections.config.json` line 9:
```
"basePath": "/Users/lcalderon/knowledge/gdrive/meet-recordings"
→
"basePath": "/Users/lcalderon/github/knowledge/gdrive/meet-recordings"
```

However, this decision deserves more than a config edit — the right question is which path is canonical. The `~/knowledge/gdrive/` tree appears to be a Google Drive sync location. The `~/github/knowledge/gdrive/` tree is inside the knowledge vault (QMD-indexed, Obsidian-visible, ingestion-written). The ingestion script is the authoritative writer; the config should match it.

### Differentiators

| Behavior | Value | Complexity |
|----------|-------|------------|
| Add path existence validation to the Library API response (return `{ exists: bool }` per collection) | Collection cards can show a "path not found" warning badge | Low |
| Surface in the Library HealthPanel when any collection basePath returns 0 docs | Catches future divergences | Low — HealthPanel already exists |

### Anti-Features / Scope Boundaries

| Anti-Feature | Why Avoid |
|--------------|-----------|
| Merging or symlinking the two directories | Would create data duplication; figure out canonical path first |
| Auto-discovering basePaths | Overkill for a single-user config; manual config is the explicit design decision |
| Moving files from old path to new | Risky file operation outside dashboard scope |

### Dependencies on Existing Features

- `collections.config.json` — the only file that needs changing for the fix
- `knowledge/route.ts` — may benefit from a `pathExists` boolean in the response for surface-level validation
- Library HealthPanel — could display warnings for zero-doc collections

---

## Feature 3: KNOW-06 — Bidirectional mem0 ↔ Obsidian Sync

### What This Means in This System

"Bidirectional" here is specific to this architecture:

- **mem0 → Obsidian (already partially working):** `mem0-export.sh` runs nightly as Step 3 of the curator. It writes yesterday's memories as `~/github/knowledge/mem0-exports/{agent_id}-YYYY-MM-DD.md`. These files land in the Obsidian vault, get QMD-indexed, and become searchable. The flow is one-way and batch.

- **Obsidian → mem0 (the missing direction):** When Luis or an agent writes something significant in Obsidian — a journal entry, a project note, a decision log — that content is not fed back into mem0 as a memory. Agents start sessions with mem0 context preloaded (KNOW-05), but they don't see what's been written directly into the vault since the last export.

### Expected Behaviors

| Behavior | Direction | Trigger | Complexity |
|----------|-----------|---------|------------|
| Nightly mem0 export to `mem0-exports/` already works | mem0 → Obsidian | 2am cron | Done |
| New Obsidian daily notes get summarized and ingested into mem0 | Obsidian → mem0 | nightly curator Step 6 | Medium |
| Session preload pulls from both mem0 memories AND recent vault markdown | Obsidian → agents | SessionStart hook | Medium |
| mem0 memories written during the day appear in vault by next morning | mem0 → Obsidian | curator Step 3 | Done |
| Vault edits from today appear in mem0 before next session | Obsidian → mem0 | curator or on-demand | Medium |

### Conflict Resolution

mem0 and Obsidian are not competing stores — they serve different purposes:

- **mem0** = structured semantic memory, searchable by agent, used for session preload and recall
- **Obsidian** = long-form markdown, human-readable, source of truth for content

There is no true conflict because they don't store the same format. The practical edge cases:

| Edge Case | Resolution |
|-----------|------------|
| A journal note duplicates something already in mem0 | Ingest anyway — mem0 deduplication is by content hash internally; near-duplicates are low risk |
| A mem0 export was already exported yesterday, vault file already exists | `mem0-export.sh` already handles idempotency: `if [ -f "$OUTFILE" ]; then skip` |
| A vault file is edited after being ingested into mem0 | mem0 does not update memories automatically; vault is source of truth, re-ingest on next run |
| mem0 is down during curator run | Step 3 is non-fatal (`|| log "Warning: mem0 export failed"`) — curator continues |

### Table Stakes Behaviors

| Behavior | Why Required | Complexity |
|----------|--------------|------------|
| Today's journal `~/github/knowledge/journals/YYYY-MM-DD.md` is read and key facts ingested into mem0 as memories | Closes the loop — vault writes become agent context | Medium — new Python script, mem0 POST API |
| Ingestion is idempotent (watermark by file mtime or content hash) | Prevents flooding mem0 with duplicates on re-runs | Medium — needs ingestion-state tracking |
| Runs as Step 6 in `knowledge-curator.sh` (non-fatal) | Follows existing curator pattern | Low — one line addition |
| New memories stored under `agent_id=shared` or `agent_id=claude` | Consistent with existing agent_id conventions in `mem0-export.sh` | Low |

### Differentiators

| Behavior | Value | Complexity |
|----------|-------|------------|
| Selective ingestion — only ingest headings, bullet lists, decisions; skip raw transcripts already in Qdrant | Avoids mem0 bloat from already-indexed content | Medium — requires heuristic filtering |
| Surface "last vault → mem0 sync" timestamp in Library or Flow panel | Closes the observability loop | Low — read from ingestion-state.json |
| Support `projects/` subdirectory ingestion (not just daily journals) | Richer context for project-specific agents | High — requires per-project agent_id routing |

### Anti-Features / Scope Boundaries

| Anti-Feature | Why Avoid |
|--------------|-----------|
| Real-time / file-watcher triggered sync | Obsidian uses iCloud/filesystem sync; file events are unreliable. Nightly batch is safer and sufficient. |
| Syncing ALL vault markdown into mem0 | mem0 is for semantic memories, not document storage. Qdrant + QMD already serve full-text search. Flooding mem0 defeats the point. |
| Writing from mem0 back to Obsidian markdown (beyond the existing export) | Export files already serve this. Two-way file writes create edit conflicts. |
| Deleting old mem0 memories when vault files are edited | mem0 has no update-by-content API; deletion + re-add is fragile and lossy |
| Exposing mem0's internal API surface in the dashboard | Read-only dashboard constraint |
| Per-memory conflict UI | Overkill — these stores are not competing; append-only is correct |

### Dependencies on Existing Features

- **knowledge-curator.sh** — new Step 6 is an extension of the existing 5-step pipeline
- **`ingestion-state.json` watermarks** — the existing pattern from Phase 5 personal ingestion; reuse for vault → mem0 tracking
- **mem0 REST API at `localhost:3201`** — already used by `mem0-export.sh`; `POST /memory/add` is the ingest endpoint
- **KNOW-05 session preload** — downstream beneficiary; richer mem0 content means better cold-start context
- **Flow diagram obsidian ↔ notebooks edge** — currently no edge exists between obsidian and notebooks nodes; a bidirectional edge should be added once sync is live

---

## Summary: Feature Ordering and Dependencies

```
Feature 2 (basePath fix)        — no dependencies, 1 config line, do first
Feature 1 (heartbeat)           — needs new API route + 2-line fix in canvas
Feature 3 (bidirectional sync)  — depends on nothing in the dashboard but is
                                   the most complex (new Python script + curator step)
```

**MVP for v1.2:** Fix meet-recordings config (Feature 2) + wire heartbeat status for both nodes (Feature 1). KNOW-06 (Feature 3) is a phase unto itself — the Obsidian → mem0 direction requires a new ingestion script with watermarks and filtering logic.

**Phase ordering rationale:**
- Feature 2 is a one-liner that fixes a silent correctness bug. Ship first.
- Feature 1 is 2–3 components (new API endpoint, updated `getStatus()`, updated nodeStats). Low risk, high visibility.
- Feature 3 is medium complexity but follows the established Phase 5 ingestion pattern closely — the main work is the Python script and watermark logic, not dashboard wiring.
