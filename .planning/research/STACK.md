# Stack Research: v1.2 — Live Data + Knowledge Sync

**Project:** agent-kitchen
**Milestone:** v1.2 — Live heartbeat, basePath fix, KNOW-06 bidirectional mem0↔Obsidian sync
**Researched:** 2026-04-11
**Scope:** New capabilities only. Existing stack (Next.js 16, Tailwind 4, TanStack Query, React Flow, mem0, Qdrant, QMD) is validated — not re-researched.

---

## Feature 1: Live Heartbeat for Obsidian + Knowledge-Curator Nodes

### Current State

`react-flow-canvas.tsx` lines 163–164 contain two hardcoded returns:

```ts
if (nodeId === "obsidian") return "active";
if (nodeId === "knowledge-curator") return "idle";
```

These bypass the entire `getStatus()` logic. The rest of the status system (service map, node activity) works correctly for other nodes. The fix is to wire these two nodes into the same pattern — no new libraries needed.

### Obsidian Health Check

**What to check:** Whether the vault directory is accessible and recently modified.

**Approach: filesystem stat inside an existing API route.**

The `/api/health` route already does `fsStat(AGENT_CONFIGS_PATH)` for the Agents service. The same pattern applies:

```ts
checkService("Obsidian", async () => {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
    ?? `${process.env.HOME}/github/knowledge`;
  await fsStat(vaultPath);
  // Optionally check mtime for "stale" detection
});
```

`fsStat` from `fs/promises` is already imported in `/api/health/route.ts`. No new package needed.

**Status mapping:**
- Directory exists + mtime within last 24h → `"active"`
- Directory exists but mtime older than 24h → `"idle"` (vault not recently updated)
- ENOENT or EACCES → `"error"`

**Recommended API surface:** Extend `/api/health` response to include an `"Obsidian"` service entry (same `HealthStatus` shape), then map it in `react-flow-canvas.tsx`'s `svcMap` like the other services.

**Confidence:** HIGH — pattern is identical to existing `fsStat` health checks already in production.

### Knowledge-Curator Health Check

**What to check:** Whether the curator ran successfully and recently.

**Ground truth:** The cron logs to `/tmp/knowledge-curator.log` (verified: `crontab -l` shows `0 2 * * * /Users/yourname/github/knowledge/knowledge-curator.sh >> /tmp/knowledge-curator.log 2>&1`).

**Approach: read log file mtime + tail for "complete" marker.**

```ts
checkService("Knowledge Curator", async () => {
  const logPath = process.env.CURATOR_LOG_PATH ?? "/tmp/knowledge-curator.log";
  const st = await fsStat(logPath);
  const hoursAgo = (Date.now() - st.mtimeMs) / 3_600_000;
  // Ran within last 26 hours = healthy (2am cron + 2h buffer)
  if (hoursAgo > 26) throw new Error(`Last run ${hoursAgo.toFixed(1)}h ago`);
});
```

The "Knowledge Curator complete." string at the end of `knowledge-curator.sh` is the success marker. Reading the last line of `/tmp/knowledge-curator.log` gives instant pass/fail.

**Status mapping:**
- Log file exists + mtime within 26h + last line contains "complete" → `"active"`
- Log file exists + mtime within 26h but last line is a warning → `"idle"`
- Log file missing or mtime > 26h → `"error"`

**No new libraries needed.** `readFile` from `fs/promises` is already used in `/api/heartbeat/route.ts`. The tail can be done with `readFile` + `split("\n").at(-2)` (same pattern as the existing heartbeat route).

**Confidence:** HIGH — log path is stable (crontab-defined), pattern matches existing code.

### Frontend Wiring

**No new polling infrastructure needed.** `/api/health` is already polled every 10s (`POLL_INTERVALS.health = 10000`). TanStack Query fetches it and passes `services` as a prop to `ReactFlowCanvas`.

**Change required in `react-flow-canvas.tsx`:**
1. Remove the two hardcoded `if (nodeId === "obsidian")` / `if (nodeId === "knowledge-curator")` lines.
2. Add entries to `svcMap`:
   ```ts
   const svcMap = {
     gateways: "Agents",
     manager: "Paperclip",
     notebooks: "mem0",
     librarian: "QMD",
     qdrant: "Qdrant",
     obsidian: "Obsidian",
     "knowledge-curator": "Knowledge Curator",
   };
   ```

**What NOT to add:** No file-watcher (chokidar, fs.watch) — this is a read dashboard on a production server; polling via the existing health route is simpler, sufficient, and avoids open file handles. No SSE or WebSocket — 10s polling matches all other health data in the system.

---

## Feature 2: Fix meet-recordings basePath Divergence

### Root Cause (Confirmed)

Two separate `meet-recordings` directories exist on the filesystem:

| Path | Files | Source |
|------|-------|--------|
| `/Users/yourname/knowledge/gdrive/meet-recordings/` | 105 | Old Drive sync (Gemini Notes format) |
| `/Users/yourname/github/knowledge/gdrive/meet-recordings/` | 100 | Phase 5 ingestion output (slugged IDs) |

`collections.config.json` currently points to the **old Drive sync path** (`/Users/yourname/knowledge/gdrive/...`). The Phase 5 ingestion script (`personal-ingestion-transcripts.py`) writes to `KNOWLEDGE_ROOT / "gdrive" / "meet-recordings"` where `KNOWLEDGE_ROOT = Path.home() / "github/knowledge"` — i.e., `/Users/yourname/github/knowledge/gdrive/meet-recordings/`.

**The fix is a one-line config change** in `collections.config.json`:

```json
{ "name": "meet-recordings", "category": "business",
  "basePath": "/Users/yourname/github/knowledge/gdrive/meet-recordings" }
```

### Approach: Merge Both Directories or Pick One

**Option A (recommended): Update config to `~/github/knowledge/gdrive/meet-recordings/`.**
This is where active ingestion writes. The Library view will then show 100 recently-generated transcript files. The old Drive sync path is a legacy artifact from before Phase 5.

**Option B: Merge paths.** The `/api/knowledge/route.ts` already supports `basePath` per collection — it could be extended to accept an array of paths and union the file lists. This is more complex and unnecessary: the old Drive sync files are not processed by the pipeline.

**Recommended:** Option A. Update `basePath` in `collections.config.json`. No code changes needed.

**No new libraries needed.** The `knowledge` route already handles `basePath` lookup via `col.basePath ?? path.join(KNOWLEDGE_BASE, col.name)`.

**Confidence:** HIGH — root cause confirmed by comparing directory contents and ingestion script source.

---

## Feature 3: KNOW-06 — Bidirectional mem0 ↔ Obsidian Sync

### What "Bidirectional" Means Here

**Direction A (already implemented):** Obsidian → mem0. The ingestion pipeline (`personal-ingestion-email.sh`, `personal-ingestion-transcripts.py`) reads markdown from the vault and calls `POST /memory/add` via `ingestion_utils.add_mem0()`. This runs nightly.

**Direction B (new — KNOW-06):** mem0 → Obsidian. Write mem0 memories back into the vault as markdown. Currently `mem0-export.sh` creates dated files in `~/github/knowledge/mem0-exports/` (e.g., `claude-2026-04-10.md`), but these are NOT linked into daily notes or the main journal structure.

### Approach for Direction B

**No new libraries needed.** The pattern is:

1. `GET /memory/all?agent_id=claude` — fetch memories (already done in `mem0-export.sh`)
2. Filter by date (already done in `mem0-export.sh`)
3. Append a `## AI Agent Memories` section to the corresponding daily note in `~/github/knowledge/journals/YYYY-MM-DD.md`

`append_daily_note()` already exists in `ingestion_utils.py` and writes to `~/github/knowledge/journals/`. The sync script extends `mem0-export.sh` logic to call `append_daily_note()` instead of (or in addition to) writing standalone export files.

**Recommended implementation: extend `knowledge-curator.sh` with a Step 3.5 (or replace Step 3):**

```bash
log "[3/5] mem0 highlights export + Obsidian sync..."
~/github/knowledge/mem0-obsidian-sync.sh || log "  Warning: mem0-Obsidian sync failed (non-fatal)"
```

Where `mem0-obsidian-sync.sh` does:
1. Fetch memories for `claude` and `shared` agent_ids for yesterday
2. Format as markdown bullet list
3. Append to `~/github/knowledge/journals/YYYY-MM-DD.md` under `## AI Agent Memories`

**Deduplication:** The daily note write must be idempotent. Check if `## AI Agent Memories` section already exists in the file before appending. Use the `ingestion-state.json` watermark pattern already in use for all other ingestion steps.

### What NOT to Build

**Do not build a real-time sync.** mem0 memories accumulate throughout the day; a nightly write to Obsidian is the right cadence — it matches the rest of the pipeline and avoids repeated file writes. The existing `append_daily_note()` in `ingestion_utils.py` is append-only, which is correct.

**Do not use obsidian-specific libraries.** Obsidian vault files are plain markdown. Python `pathlib` + string operations are sufficient — same as the rest of the pipeline.

**Do not use `watchdog` or `inotify`.** Real-time file watching on the vault adds complexity and failure modes not justified for a daily sync.

**Do not use mem0's Python SDK directly.** The existing stack uses the REST API (`http://localhost:3201`) consistently. All scripts use `curl` or `requests`. Introducing the SDK would be a new dependency with different error handling.

### Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| mem0 REST API `/memory/all?agent_id=X` works | HIGH | Used in `mem0-export.sh` and `mcp-mem0.py` in production |
| `append_daily_note()` works for vault writes | HIGH | Used in `personal-ingestion-transcripts.py` in production |
| ingestion-state.json watermark for deduplication | HIGH | Used for all 5 ingestion steps |
| Nightly cadence is sufficient | HIGH | Aligns with existing pipeline schedule |

---

## Summary: New Stack Additions for v1.2

**None.** All three features are implemented using patterns and modules already in the codebase:

| Feature | Approach | New Packages |
|---------|----------|-------------|
| Obsidian heartbeat | `fsStat` on vault dir + mtime check, extend `/api/health` | 0 |
| Curator heartbeat | `fsStat` + tail `/tmp/knowledge-curator.log`, extend `/api/health` | 0 |
| basePath fix | One-line change in `collections.config.json` | 0 |
| mem0→Obsidian sync | New shell script + Python extending `mem0-export.sh` and `append_daily_note()` | 0 |

**Environment variable additions (no package changes):**
- `OBSIDIAN_VAULT_PATH` — optional override for vault root (default: `$HOME/github/knowledge`)
- `CURATOR_LOG_PATH` — optional override for curator log (default: `/tmp/knowledge-curator.log`)

Both follow the existing `process.env.X ?? fallback` pattern in `constants.ts`.

---

## Integration Points

| Component | Reads from | Writes to |
|-----------|-----------|-----------|
| `/api/health/route.ts` | `fsStat` on vault + `/tmp/knowledge-curator.log` | `HealthStatus[]` in response |
| `react-flow-canvas.tsx` | `services` prop (from `/api/health`) | Node status color/glow |
| `collections.config.json` | (config file) | `/api/knowledge/route.ts` reads it |
| `mem0-obsidian-sync.sh` (new) | `GET /memory/all` from mem0 | `~/github/knowledge/journals/YYYY-MM-DD.md` |
| `knowledge-curator.sh` | (orchestrator) | Calls `mem0-obsidian-sync.sh` as new step |

---

## What NOT to Add

- `chokidar` or any file watcher — polling via existing health route is sufficient
- `mem0` Python SDK — REST API is the established pattern in this codebase
- Any markdown parser library — vault files are append-only, string templating is sufficient
- SSE or WebSocket for heartbeat — 10s polling matches all other live data
- A second `basePath` in the config for meet-recordings — pick one canonical path (the ingestion output path)
