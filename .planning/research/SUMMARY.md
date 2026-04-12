# Research Summary: v1.2 — Live Data + Knowledge Sync

**Synthesized:** 2026-04-11
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md
**Overall Confidence:** HIGH — all findings from direct codebase + filesystem inspection

---

## Stack Additions

**None.** Zero new packages or dependencies.

Every feature reuses existing modules:

| Need | Existing Solution |
|------|-------------------|
| Vault/log health signals | `fsStat` / `readFile` from `fs/promises` (already imported in `/api/health`) |
| Polling new health data | TanStack Query (`POLL_INTERVALS.health = 10s`) — already wired |
| basePath fix | One-line edit in `collections.config.json` — no code |
| mem0 → Obsidian sync | `mem0-export.sh` pattern + `append_daily_note()` in `ingestion_utils.py` |
| Obsidian → mem0 sync | New Python script using `requests` + `ingestion-state.json` watermarks |

**New env vars only (no package change):**
- `OBSIDIAN_VAULT_PATH` — optional override, default `$HOME/github/knowledge`
- `CURATOR_LOG_PATH` — optional override, default `/tmp/knowledge-curator.log`

**Explicitly do NOT add:** chokidar, watchdog, inotify, mem0 Python SDK, any markdown parser library, SSE/WebSocket.

---

## Feature Table Stakes

### Feature 1: Live Heartbeat for obsidian + knowledge-curator Nodes

**Done when:**
- Obsidian node derives status from `fsStat` on `~/github/knowledge/` (not hardcoded `"active"`)
  - Active: vault dir accessible + today's journal file exists
  - Idle: vault accessible but last journal is > 24h old
  - Error: directory missing or inaccessible
- knowledge-curator node derives status from `/tmp/knowledge-curator.log` mtime + last line
  - Active: log mtime < 26h ago AND last line contains "Knowledge Curator complete."
  - Idle: log mtime < 26h ago but last line shows a warning (run ran but had failures)
  - Error: log missing OR mtime > 26h ago (missed a cron run)
- The two hardcoded `if (nodeId === "obsidian")` / `if (nodeId === "knowledge-curator")` lines in `getStatus()` are removed
- Both node IDs are added to `svcMap` in `react-flow-canvas.tsx`

### Feature 2: Fix meet-recordings basePath Divergence

**Done when:**
- `collections.config.json` `meet-recordings` entry points to `/Users/yourname/github/knowledge/gdrive/meet-recordings`
- Library view shows ~100 docs for meet-recordings (not ~5 from the stale GDrive sync path)
- No other collection entries are touched — surgical edit only
- `npm start` is restarted to clear process cache

### Feature 3: KNOW-06 Bidirectional mem0 ↔ Obsidian Sync

**Done when:**
- **Obsidian → mem0:** New `obsidian-to-mem0.py` reads target vault files (journals, `shared/PENDING_FACTS.md`, `shared/CURRENT_PRIORITIES.md`), chunks by heading/paragraph, posts to `POST /memory/add` with directory-based `agent_id` routing
- **Deduplication:** `obsidian-ingestion-state.json` watermark (mtime-based, atomic write) prevents re-ingesting unchanged files
- **Origin tagging:** Memories from Obsidian carry `metadata.source = "obsidian"` so mem0 → Obsidian export skips them
- **Curator integration:** `knowledge-curator.sh` calls `obsidian-to-mem0.py` as non-fatal Step 6
- **Direction A confirmation:** `mem0-exports/` entry added to `collections.config.json` to make existing exports visible in Library
- Client-side deduplication check (word-overlap gate) runs before every `POST /memory/add`

---

## Architecture Changes

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `~/github/knowledge/obsidian-to-mem0.py` | NEW Python script | Obsidian → mem0 direction of KNOW-06 (~150-200 lines) |
| `~/github/knowledge/obsidian-ingestion-state.json` | NEW state file | mtime watermarks for per-file ingestion tracking |

### Modified Components

| Component | Change | Scope |
|-----------|--------|-------|
| `src/app/api/health/route.ts` | Add 2 `checkService()` entries | "Obsidian" (fsStat) + "Curator" (log mtime + tail) |
| `src/components/flow/react-flow-canvas.tsx` | Update `svcMap` + remove hardcoded returns | 3 lines changed |
| `collections.config.json` | Fix meet-recordings basePath + add mem0-exports entry | 2 lines changed |
| `~/github/knowledge/knowledge-curator.sh` | Add Step 6 call | 2 lines added |

### Data Flow Changes

**Feature 1 — new path through `/api/health`:**
```
/api/health (extended)
  fsStat("~/github/knowledge") + stat("journals/YYYY-MM-DD.md") → "Obsidian" service entry
  readFile("/tmp/knowledge-curator.log") mtime + last line → "Curator" service entry
    → ReactFlowCanvas.svcMap routes service name to node color
```

**Feature 3 — new nightly loop:**
```
knowledge-curator.sh 2am
  Step 6: obsidian-to-mem0.py
    reads journals/*.md, shared/PENDING_FACTS.md, shared/CURRENT_PRIORITIES.md
    checks obsidian-ingestion-state.json watermarks (skip if mtime unchanged)
    client-side dedup gate (word-overlap check vs existing memories)
    POST /memory/add (agent_id: journals→claude, shared→shared)
    updates obsidian-ingestion-state.json atomically
```

### Recommended Build Order

1. **Feature 2 (basePath fix)** — zero risk, 1 config line, verifiable immediately in Library view
2. **Feature 1 (heartbeat)** — extend `/api/health`, update `svcMap`, remove hardcoded lines; test: kill vault access, confirm node turns red
3. **Feature 3 (KNOW-06)** — standalone Python work, no dashboard dependency; test: run `obsidian-to-mem0.py` manually, verify entries in `GET /memory/all?agent_id=claude`

---

## Watch Out For

### 1. Heartbeat: Do NOT use recursive readdir on the vault (CRITICAL performance)
518+ files. A `readdir({ recursive: true })` on every 10s poll = 500+ inode reads per cycle. Use targeted `stat()` on 3-5 known paths only: vault root + today's journal. The Library API already does the expensive walk — never duplicate it in the health route.

### 2. Heartbeat: mtime window must account for cron cadence, not recency
Curator runs at 2am. By midnight it is 22h stale — a "modified in last 1h" check will permanently show idle. Use a 26h window. Also check the last line of the log for "Knowledge Curator complete." — mtime alone does not confirm the run finished vs. was interrupted.

### 3. KNOW-06: Three interlocking loop guards required (CRITICAL correctness)
All three are required — missing one allows duplicate accumulation:
- **Origin tag:** `metadata.source = "obsidian"` — mem0 → Obsidian export skips these
- **Word-overlap dedup gate:** client-side check before every `POST /memory/add`
- **mtime watermark:** `obsidian-ingestion-state.json` skips unchanged files

### 4. KNOW-06: Write to isolated directories, never into existing Obsidian notes (CRITICAL data integrity)
Writing into existing vault notes risks corrupting YAML frontmatter, which breaks QMD indexing silently. Use the `mem0-exports/{agent_id}-{date}.md` pattern — isolated, append-only, no frontmatter risk.

### 5. basePath fix: surgical edit on meet-recordings only
`collections.config.json` has 19 entries. `alex-docs` and `turnedyellow-admin` share the `~/knowledge/gdrive/` prefix intentionally — they are GDrive sync paths, not ingestion output. Do not change them. One entry, one value.

### 6. Production requires process restart after JSON config change
`collections.config.json` is read at request time (`readFileSync`, `force-dynamic`). No `npm run build` needed, but `npm start` must restart. Silently stale otherwise.

### 7. `execSync` is blocked — do not check process liveness
Security hook blocks `execSync`/`exec`. Log file mtime + last line is both simpler and more correct for a cron job than a process liveness check.

---

## Open Questions

1. **Primary Obsidian health signal:** Vault root mtime (any access) vs. today's journal file (pipeline ran). Recommendation: check both — vault root for "accessible," today's journal for "active."

2. **KNOW-06 file scope:** journals + `shared/PENDING_FACTS.md` + `shared/CURRENT_PRIORITIES.md` confirmed. `projects/*/meetings/*.md` is a differentiator but flagged HIGH complexity. Requirements phase should lock scope to prevent v1.3 creep.

3. **`mem0-exports/` in Library:** Architecture flags this as a 1-line config addition to make existing exports visible. Confirm whether this is in scope for v1.2 or deferred.

4. **agent_id routing map:** Directory-based routing proposed (`journals/` → `claude`, `shared/` → `shared`). Must be confirmed in requirements — changing post-implementation requires full re-ingestion.

5. **Old `~/knowledge/gdrive/meet-recordings/` path:** Confirm it is not used by anything else (QMD's own index, other scripts) before any cleanup outside this milestone.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack additions (none) | HIGH | All patterns confirmed in existing production code |
| Feature 1 heartbeat mechanics | HIGH | Hardcoded lines found at exact source locations; `/api/health` pattern clean and duplicatable |
| Feature 2 root cause | HIGH | Both directories confirmed on filesystem; ingestion script KNOWLEDGE_ROOT traced |
| Feature 3 Direction A (mem0 → Obsidian) | HIGH | `mem0-export.sh` already works; gap is only Library visibility |
| Feature 3 Direction B (Obsidian → mem0) | MEDIUM | Pattern is solid; mem0 semantic dedup under sustained load not tested |
| Loop guard completeness | MEDIUM | Three guards address nightly batch sync; additional edge cases possible under non-standard run conditions |
