# Pitfalls Research: v1.2 Features

**Project:** Agent Kitchen
**Researched:** 2026-04-11
**Features covered:** Heartbeat health checks, basePath config fix, bidirectional mem0/Obsidian sync

---

## Feature 1: Live Heartbeat Health Checks (obsidian + knowledge-curator nodes)

### Critical Pitfall 1-A: Using Wrong Signal Type for Each Node

**What goes wrong:** The two nodes need fundamentally different signal types. Obsidian is a filesystem vault — its health is a directory stat (does the path exist, how recently was a file modified). knowledge-curator is a cron job — its health is a log file's mtime and content. Treating both with the same mechanism (e.g., both checking HEARTBEAT_STATE.md in agent-configs) will fail because neither node lives in the agent-configs directory. The existing heartbeat route at `/api/heartbeat` reads `AGENT_CONFIGS_PATH/{agentId}/HEARTBEAT_STATE.md` — this path is valid for named agents like alba/gwen but will silently return `{ content: null }` for obsidian and knowledge-curator, because there are no subdirectories for them there.

**Warning sign:** The node shows `{ content: null }` in the heartbeat panel. No error, no 400 — just empty, because the route catches all errors and returns null gracefully (per D-05). This is the correct behavior for agents, but for obsidian/knowledge-curator it masks the wrong path silently.

**Prevention:** Implement separate health signals per node type. For obsidian: `stat()` the vault root (`~/github/knowledge/`) and sample mtime of 3-5 recent files to derive freshness. For knowledge-curator: read mtime of `/tmp/knowledge-curator.log` (the cron log defined in knowledge-curator.sh line 3) and optionally tail its last line to confirm "Knowledge Curator complete." appeared. Both should be separate API routes or a single route that dispatches by nodeId with an explicit allowlist.

**Phase:** Heartbeat implementation phase.

---

### Critical Pitfall 1-B: Stale File Detection — mtime vs. Content

**What goes wrong:** File mtime is set by the OS at write time, not at meaningful completion. The knowledge-curator.sh script writes intermediate output throughout its 5-step run. A check that fires mid-run will see a very recent mtime and report "active" — but the curator is mid-flight, not complete. Conversely, after a successful 2am run, the log will be ~22 hours stale by midnight — a naive "modified in last 1h" check will permanently show "idle" or "error" throughout the day.

**Warning sign:** The node oscillates between active/idle randomly, or permanently shows "stale" even after successful runs.

**Prevention:** Check mtime against an expected cadence window. The curator runs at 2am (`0 2 * * *`). "Fresh" means the log was written sometime between 2:00am and 2:30am today (or yesterday if checked before 2am). The logic should be: `ageHours = (now - logMtime) / 3600`. If `ageHours < 24` and the final line of the log contains "Knowledge Curator complete.", status is healthy. If `ageHours >= 28`, status is stale (missed a run). Between 24-28h is the grace window for slow runs. Additionally grep the last line — not just the mtime — to confirm the run completed (not interrupted mid-step).

**Phase:** Heartbeat implementation phase.

---

### Moderate Pitfall 1-C: Performance Impact — `readdir` on Vault Root Is Expensive

**What goes wrong:** The Obsidian vault (`~/github/knowledge/`) has 518+ markdown files across nested directories. If the heartbeat API calls `readdir({ recursive: true })` on the vault root to compute "doc count" or find the newest file mtime, it does a full directory walk on every poll cycle (the Flow page polls every 15s). On production (`npm start`), this blocks the event loop equivalent — not catastrophic but adds 20-200ms per cycle and generates inode access at high frequency.

**Warning sign:** Library API and heartbeat API start returning slower, especially when knowledge-curator is running and creating/modifying files simultaneously.

**Prevention:** For the obsidian heartbeat, do NOT walk the tree. Instead: (1) `stat()` the vault root directory itself — its mtime updates when any direct child changes; (2) stat 3-5 specific known files (e.g., today's journal `journals/YYYY-MM-DD.md`) that are updated nightly. This is O(5) stats, not O(500) readdir. The Library API already does the expensive `readdir` on its own cycle — don't duplicate it in the heartbeat route.

**Phase:** Heartbeat implementation phase.

---

### Moderate Pitfall 1-D: Production Build Doesn't Hot-Reload API Routes

**What goes wrong:** Production runs as `npm start` (compiled output). Any change to `/api/heartbeat/route.ts` or a new API route requires a full `npm run build && npm start`. Developers testing in dev mode see changes immediately and may declare the feature "working" — then deploy to production and find the old code is still running. This has burned time in previous phases.

**Warning sign:** Changes to API routes appear to have no effect in production. Dashboard continues to show hardcoded values after deployment.

**Prevention:** After any API route change, run `npm run build` first, confirm the build succeeds, then restart `npm start`. Add a test that hits the actual API endpoint shape (status field, not just `content: null`) so CI catches wrong shapes before deploy.

**Phase:** All implementation phases.

---

### Minor Pitfall 1-E: Security Hook Blocks exec/execSync for Log Reading

**What goes wrong:** The temptation to check whether knowledge-curator is "currently running" via `ps aux | grep knowledge-curator` requires `exec` or `execSync`, both of which are blocked by the project security hook. Using `execFileSync('ps', ['-ax'])` is the permitted path, but it still spawns a subprocess on every heartbeat poll — which is wasteful.

**Warning sign:** Build or runtime error: "execSync is not allowed."

**Prevention:** Don't check process liveness. Check the log file instead (mtime + last line). Log file state is ground truth for a cron job — if the cron ran and completed, the log reflects it. Live process checks are only needed if the job were long-running/daemonic, which knowledge-curator is not (it runs and exits).

**Phase:** Heartbeat implementation phase.

---

## Feature 2: meet-recordings basePath Fix

### Critical Pitfall 2-A: Two Different Directories, Both Valid — Wrong Fix Target

**What goes wrong:** There are two separate meet-recordings directories:
- `/Users/yourname/knowledge/gdrive/meet-recordings/` — the old GDrive-synced path (pre-ingestion pipeline). Contains human-readable named files like "1 on 1 Sync (Chris Rhine) - 2025-06-18 Notes by Gemini.md". This is what `collections.config.json` currently points to.
- `/Users/yourname/github/knowledge/gdrive/meet-recordings/` — the new canonical path where `personal-ingestion-transcripts.py` writes processed transcripts. Contains date-stamped machine-generated filenames like "2026-01-29-1afbj6VNUEc7wuO.md".

These are different directories with different file counts, different naming conventions, and different update mechanisms. The config fix must point to the right one based on intent: the Library view should show what the ingestion pipeline produces (the `~/github/knowledge/gdrive/meet-recordings/` path). Simply fixing the typo while misidentifying which directory is "correct" would silently show wrong counts.

**Warning sign:** After the fix, the doc count in the Library changes but is still wrong (e.g., shows 5 instead of 105, or vice versa).

**Prevention:** Confirm intent before editing: the Library should reflect what the nightly pipeline produces. The ingestion writes to `~/github/knowledge/gdrive/meet-recordings/`. Update `collections.config.json` to `basePath: "/Users/yourname/github/knowledge/gdrive/meet-recordings"`. Do not modify the old path — it may still be used by QMD's own collection index, which is separate from the Library view.

**Phase:** basePath fix phase (one-line config change).

---

### Moderate Pitfall 2-B: Config Change Requires Rebuild

**What goes wrong:** `collections.config.json` is read at runtime via `readFileSync` inside `loadCollections()` in the knowledge API route. In dev mode, Next.js hot-reloads the module and re-reads the file. In production (`npm start`), the compiled output may not re-read the config until the process is restarted. Some engineers assume a JSON config change doesn't need a rebuild — it does not need a full `npm run build`, but it does require a process restart (`npm start` restart).

**Warning sign:** Config change applied, but Library still shows old doc count.

**Prevention:** After editing `collections.config.json`, restart `npm start`. No rebuild needed (the route reads the file at request time with `readFileSync`, not at compile time), but the process must restart to clear any module cache if there is one.

**Phase:** basePath fix phase.

---

### Minor Pitfall 2-C: Breaking Other Collections by Editing the Wrong Entry

**What goes wrong:** `collections.config.json` has 19 collections. A global find-replace on the wrong substring (e.g., replacing all `knowledge/gdrive/` paths) would corrupt the `alex-docs` and `turnedyellow-admin` entries, which share the same `~/knowledge/gdrive/` prefix and are pointing to correct locations.

**Warning sign:** Library shows 0 docs for alex-docs or turnedyellow-admin after the fix.

**Prevention:** Edit only the `meet-recordings` entry. Treat every other entry as read-only during this change. The fix is surgical: one entry, one value, one path segment change (`/Users/yourname/knowledge/` → `/Users/yourname/github/knowledge/`). Verify the other gdrive entries are unchanged after the edit.

**Phase:** basePath fix phase.

---

## Feature 3: Bidirectional mem0 ↔ Obsidian Sync (KNOW-06)

### Critical Pitfall 3-A: Infinite Loop — mem0 Write Triggers Obsidian Watcher, Which Writes Back to mem0

**What goes wrong:** The classic bidirectional sync loop. If the sync is triggered by file events (inotify/FSEvents on the Obsidian vault), writing a new markdown file to the vault (mem0 → Obsidian direction) fires the watcher, which then attempts to sync back (Obsidian → mem0 direction), creating a new mem0 memory, which triggers another Obsidian write, and so on. This is not hypothetical — it is the default failure mode of any bidirectional sync without loop detection.

**Warning sign:** mem0 memory count grows unboundedly. `/tmp/knowledge-curator.log` shows repeated identical entries. The Obsidian vault's `mem0-exports/` directory fills with duplicate files.

**Prevention:** Three interlocking guards are required, not just one:

1. **Origin tagging:** When mem0 writes a memory that comes from Obsidian (direction: Obsidian → mem0), tag it with `metadata.source = "obsidian"`. When the sync checks memories to export to Obsidian (direction: mem0 → Obsidian), skip any memory with `source = "obsidian"`. This breaks the first feedback path.

2. **Write lock file:** Before writing to the Obsidian vault, create a lockfile (e.g., `/tmp/mem0-obsidian-sync.lock`). The vault watcher checks for this lockfile before initiating a mem0 write. If the lockfile exists, skip. Remove the lockfile after the write completes. Use a timeout (30s max) to prevent stale locks.

3. **Content hash deduplication:** Before adding a memory to mem0 from Obsidian, compute a hash of the content and check if an identical memory already exists. The mem0 REST API does not provide a deduplication guarantee — it will create duplicates if called with the same text twice.

**Phase:** KNOW-06 implementation phase — must address all three guards before any live sync.

---

### Critical Pitfall 3-B: Modifying agent_memory Qdrant Collection Directly

**What goes wrong:** KNOW-06 is explicitly constrained: "mem0 agent_memory Qdrant collection must NOT be modified directly." The bidirectional sync must go through the mem0 REST API (`http://localhost:3201`), not through Qdrant's API directly. Bypassing mem0 and writing points directly to Qdrant would: (1) skip mem0's deduplication logic; (2) skip mem0's fact extraction (mem0 converts raw text into condensed memories, not stored verbatim); (3) leave mem0's SQLite history out of sync with Qdrant, causing phantom memories.

**Warning sign:** Memories appear in Qdrant `agent_memory` but are not returned by `GET /memory/all?agent_id=...`. Or `sqlite3 ~/.mem0/history.db` shows no record of a memory that exists in Qdrant.

**Prevention:** All writes to mem0 must use `POST /memory/add` with `{"agent_id": "...", "text": "...", "metadata": {...}}`. Never use `qmd embed`. Never use the Qdrant SDK or REST API to write to `agent_memory`. Treat the mem0 REST API as the only write path.

**Phase:** KNOW-06 implementation phase.

---

### Critical Pitfall 3-C: Obsidian File Format Corruption from Naive Writes

**What goes wrong:** Obsidian markdown files are not plain markdown — they use YAML frontmatter, wikilinks (`[[...]]`), tags (`#tag`), and occasionally Dataview inline metadata. Writing mem0 memories into Obsidian as raw bullet points into a file that has frontmatter will either: (1) append below the frontmatter correctly (if the writer is careful); or (2) write into the middle of a YAML block, corrupting the frontmatter and breaking Obsidian's parsing for that file. Obsidian silently ignores malformed frontmatter, so the corruption may not be obvious until QMD re-indexes and returns unexpected results.

The Obsidian vault is also the QMD source. A corrupted or malformed file gets indexed by QMD with wrong metadata, silently poisoning keyword search results.

**Warning sign:** QMD returns empty or wrong results for a previously working query. Obsidian shows a file with `---` at unexpected positions. The file's doc count in the Library view is unchanged (the file exists) but its content is wrong.

**Prevention:** Write mem0 memories to a dedicated, append-only subdirectory that is NOT in the existing note hierarchy. The existing export pattern (`mem0-exports/{agent_id}-{date}.md`) is the correct model — it isolates writes to a predictable location with a simple format that has no frontmatter. Do not write into existing Obsidian notes (journals, wikis, etc.). If the goal is to create new Obsidian notes from mem0 memories, generate them with valid YAML frontmatter (`---\ntags: [mem0, sync]\ncreated: ...\n---`).

**Phase:** KNOW-06 implementation phase.

---

### Critical Pitfall 3-D: Conflict Resolution When Both Sides Modified Between Syncs

**What goes wrong:** The sync runs nightly. Luis edits a memory in Obsidian during the day, and the same underlying fact is also updated in mem0 (by an agent session) during the day. When the nightly sync runs, both versions differ from the last-synced baseline. Without a baseline snapshot, the sync cannot distinguish "edit" from "conflict" and will either: (1) blindly overwrite mem0 with the Obsidian version (losing the agent session's learning); or (2) blindly overwrite Obsidian with the mem0 version (losing Luis's manual edit).

**Warning sign:** After a sync run, a note Luis edited during the day has been reverted. Or a memory Luis deleted in Obsidian reappears the next day.

**Prevention:** Adopt a last-write-wins strategy with explicit timestamps, since this is a single-user system with no concurrent multi-user conflicts. The rule: compare `created_at` / `updated_at` from mem0 against file mtime from Obsidian. Take whichever was modified most recently. Document this decision explicitly in the sync script. This is simpler than three-way merge and appropriate for a personal knowledge base. Store the last sync timestamp in `ingestion-state.json` (which already uses atomic writes via `os.replace()` — reuse this pattern).

**Phase:** KNOW-06 implementation phase.

---

### Moderate Pitfall 3-E: mem0 Deduplication Is Not Guaranteed

**What goes wrong:** mem0's fact extraction process condenses free-text into memory facts. If Obsidian has 10 notes about "Luis prefers concise agent responses," running them through `POST /memory/add` 10 times will not necessarily produce 1 memory — it may produce 2-4 near-duplicate memories depending on mem0's internal deduplication heuristics. The mem0 REST API does not expose a "check if this already exists" endpoint. Over multiple sync runs (nightly for weeks), the memory count for an agent_id grows with near-duplicates.

**Warning sign:** `GET /memory/all?agent_id=claude` returns 200+ entries where many are semantically identical. The Notebook Wall view shows a higher-than-expected memory count.

**Prevention:** Before calling `POST /memory/add`, fetch all existing memories for the agent_id and compute similarity client-side. A simple approach: normalize the text (lowercase, strip punctuation, strip whitespace) and compare with existing memories using exact string match. For near-duplicate detection, check if the new text shares >80% of its words with an existing memory. Skip the add if a match is found. This client-side gate is cheaper than letting mem0 store duplicates and cleaning them up later.

**Phase:** KNOW-06 implementation phase.

---

### Moderate Pitfall 3-F: Obsidian → mem0 Direction Must Choose the Right agent_id

**What goes wrong:** mem0 has 17 known agent_ids (claude, shared, ceo, cto, etc.). When syncing Obsidian notes to mem0, which agent_id receives the memory? If all notes go to `shared`, they become globally visible to all agents but lose personal/role specificity. If they go to `claude`, they are only visible when claude agent_id is used in sessions. If the wrong agent_id is chosen, the session-start preload (KNOW-05) will not surface the memory to the right agent.

**Warning sign:** A fact that Luis added to Obsidian is not shown in Claude Code session preloads. Or it appears in an unrelated agent's context.

**Prevention:** Use the directory structure of the Obsidian vault to determine agent_id. Notes in `shared/` → `agent_id: shared`. Notes in `journals/` → `agent_id: claude` (personal). Notes in role-specific directories → the corresponding role agent_id. Document the mapping in a config or as comments in the sync script. Default to `shared` for uncategorized notes.

**Phase:** KNOW-06 implementation phase.

---

### Minor Pitfall 3-G: QMD Index Becomes Stale When mem0-exports Directory Grows

**What goes wrong:** `mem0-exports/` is inside the Obsidian vault (`~/github/knowledge/mem0-exports/`) and is a QMD-indexed collection. As KNOW-06 generates more files in this directory (or in a new sync output directory), QMD's BM25 index becomes stale. QMD requires `qmd update` to re-index. This is already handled by knowledge-curator.sh step 4, but KNOW-06 syncs may run independently or at different times.

**Warning sign:** QMD keyword search returns outdated results for recently synced content.

**Prevention:** If KNOW-06 runs as a standalone script outside knowledge-curator.sh, append a `qmd update` call at the end. If it runs as a new step 6 inside knowledge-curator.sh, it inherits the existing `qmd update` in step 4. The Qdrant vector index (qdrant-indexer.py) must also re-run to pick up new markdown files. Do not assume QMD auto-updates — it requires explicit `qmd update`.

**Phase:** KNOW-06 implementation phase and integration into knowledge-curator.sh.

---

## Phase-Specific Warning Summary

| Phase / Feature | Pitfall | Mitigation |
|-----------------|---------|------------|
| Heartbeat — obsidian | Wrong signal type (HEARTBEAT_STATE.md won't exist) | Stat vault root + journal mtime, not agent-configs path |
| Heartbeat — knowledge-curator | Stale mtime mid-run or 22h after valid run | Check log mtime vs. 24h cadence + grep last line for "complete" |
| Heartbeat — obsidian | readdir on vault = expensive | Stat 3-5 known files only, never recursive readdir |
| Heartbeat — both | execSync blocked by security hook | Read log file; don't check process liveness |
| basePath fix | Two directories, both valid | Point to `~/github/knowledge/gdrive/meet-recordings/` (ingestion output) |
| basePath fix | Edit bleeds into adjacent gdrive entries | Surgical edit, only meet-recordings entry |
| basePath fix | Config change invisible in prod | Restart `npm start` after editing JSON |
| KNOW-06 | Infinite sync loop | Origin tag + lockfile + content hash — all three required |
| KNOW-06 | Direct Qdrant write to agent_memory | mem0 REST API only, never Qdrant SDK/HTTP directly |
| KNOW-06 | Obsidian file corruption | Write to isolated `mem0-exports/`-style directory, not into existing notes |
| KNOW-06 | Conflict resolution | Last-write-wins by timestamp; store sync watermark in ingestion-state.json |
| KNOW-06 | mem0 duplicates over time | Client-side deduplication check before every POST /memory/add |
| KNOW-06 | Wrong agent_id for Obsidian notes | Directory-based routing map; default to `shared` |
| KNOW-06 + QMD | Stale QMD index after new files | Ensure `qmd update` runs after any sync that writes new markdown |
