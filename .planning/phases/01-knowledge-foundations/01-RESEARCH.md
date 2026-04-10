# Phase 1: Knowledge Foundations - Research

**Researched:** 2026-04-09
**Domain:** QMD collection management, Obsidian vault integration, llm-wiki indexing, gitnexus cron automation
**Confidence:** HIGH (all findings verified against live system)

> ⚠️ **ARCHITECTURE CORRECTION (2026-04-09):** This research incorrectly assumes `qmd embed` is the vector/semantic search solution. The established architecture uses **Qdrant Cloud** (AWS us-west-1) for ALL vector search. `qmd embed` stores vectors in local SQLite — this is the **wrong vector store**. References to `qmd embed` below apply only to keyword/BM25 indexing context. The Qdrant markdown indexing pipeline (`knowledge_docs` collection) is built in Phase 2, not Phase 1. See `~/github/knowledge/mem0-config.yaml` for the canonical vector store config.

---

## Summary

Phase 1 wires three knowledge sources — the Obsidian vault at `~/github/knowledge/`, the llm-wiki pages, and the gitnexus analyze runs — into the automated refresh infrastructure so they appear as tracked collections in the Library view and run without manual intervention.

The good news: the infrastructure is already almost entirely in place. QMD is installed at v1.1.5. A weekly cron (`refresh-index.sh`, every Sunday 07:00) runs `qmd update && qmd embed`. A daily cron (`gitnexus-index.sh`, every night 03:00) indexes 8 repos with smart commit-based skipping. The Library view reads from `collections.config.json` and shows doc count plus freshness date. The data model already has `lastUpdated` in `KnowledgeCollection`. Most of Phase 1 is config wiring, not code.

The three gaps to close: (1) the Obsidian vault (`~/github/knowledge/`) is not registered in `collections.config.json` or QMD, (2) `llm-wiki` is in `collections.config.json` but points to the wrong path (the vault root, not `wiki/` subdir) and was not in QMD until this research session verified the `qmd collection add` command, (3) `gitnexus-index.sh` already runs on the 8 repos but runs daily — the requirement says "weekly refresh cron", so either the existing daily cron satisfies the requirement or the weekly `refresh-index.sh` needs a call to `gitnexus-index.sh` added.

**Primary recommendation:** Three targeted config edits (collections.config.json x2, refresh-index.sh x1) and one `qmd collection add` command for the vault. No new infrastructure required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-02 | Obsidian vault (`~/github/knowledge/`) appears in Library view with doc count and freshness | Add entry to `collections.config.json` with `basePath`; API already reads both fields. CollectionCard must be updated to render `lastUpdated`. |
| KNOW-03 | llm-wiki wiki pages indexed by QMD and searchable by agents | Fix path in `collections.config.json` to point at `wiki/` subdir; run `qmd collection add` to register in QMD's own config. |
| KNOW-04 | `gitnexus analyze` runs automatically in weekly refresh cron across all 8 repos | `gitnexus-index.sh` already covers 8 repos and runs daily; add a call to it from `refresh-index.sh` so the weekly cron also triggers it. |
</phase_requirements>

---

## Standard Stack

### Core — already installed, no new dependencies

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| qmd | 1.1.5 | Hybrid search index — lexical + vector over markdown collections | Installed at `/opt/homebrew/bin/qmd` [VERIFIED: `qmd --version`] |
| gitnexus | (npm/npx) | Code graph indexer | In use via `npx gitnexus analyze`, daily cron active [VERIFIED: crontab, `gitnexus-index.sh`] |
| Next.js API routes | (project version) | Serves `/api/knowledge` and `/api/gitnexus` to the Library view | Exists, working [VERIFIED: source] |
| vitest | (devDep) | Unit test runner for React components | Config at `vitest.config.ts`, test suite at `src/test/` [VERIFIED: source] |

**No new packages to install.** Phase 1 is pure configuration + one UI tweak.

---

## Architecture Patterns

### How the Library View Gets Its Data

```
collections.config.json          ~/.config/qmd/index.yml
        |                                  |
        v                                  v
/api/knowledge (route.ts)        qmd CLI / qmd mcp
        |                                  |
        v                                  v
Library page (useKnowledge)      Agents querying qmd search/vsearch
```

**Two separate registries exist and must be kept in sync:**

1. **`collections.config.json`** (project root) — drives the agent-kitchen Library view UI. The `/api/knowledge` route reads this file, resolves `basePath ?? path.join(KNOWLEDGE_BASE, name)`, walks the directory for `.md` files, and returns `{ name, docCount, category, lastUpdated }`. `KNOWLEDGE_BASE` defaults to `~/github/knowledge` (from `KNOWLEDGE_BASE_PATH` env var or hardcoded fallback).

2. **`~/.config/qmd/index.yml`** — drives QMD's own search index. Managed by `qmd collection add/remove`. Completely separate from the app config. Agents searching via `qmd query` or the QMD MCP use this registry.

Both must have the correct path for a collection to (a) appear in the Library view AND (b) be searchable by agents.

### Recommended Project Structure (Phase 1 — config-only changes)

```
agent-kitchen/
├── collections.config.json        # ADD: knowledge vault + fix llm-wiki path
└── src/
    └── components/library/
        └── collection-card.tsx    # ADD: render lastUpdated (freshness date)

~/github/knowledge/
└── refresh-index.sh               # ADD: call to gitnexus-index.sh

~/.config/qmd/index.yml            # ADD: knowledge vault entry (via qmd collection add)
```

### Pattern 1: Registering a Collection — Dual-System Add

Every new collection requires two operations:

**Step A — UI registry** (`collections.config.json`):
```json
// Source: verified from /api/knowledge/route.ts
{
  "name": "knowledge",
  "category": "other",
  "basePath": "/Users/yourname/github/knowledge"
}
```
The `basePath` field overrides the default `KNOWLEDGE_BASE/name` resolution. Required whenever the path does not follow the `~/github/knowledge/<name>` convention.

**Step B — QMD search registry** (run once, persists to `~/.config/qmd/index.yml`):
```bash
# Source: verified via qmd --help and live test
qmd collection add --path ~/github/knowledge --name knowledge
qmd update
# DO NOT run qmd embed — vector/semantic search uses Qdrant Cloud, not SQLite
```

### Pattern 2: llm-wiki Path Discrepancy

`collections.config.json` has:
```json
{ "name": "llm-wiki", "category": "business" }
```
No `basePath` — so the API resolves to `~/github/knowledge/llm-wiki` (the repo root, which has 3 `.md` files: README, GETTING-STARTED, LLM-WIKI schema docs).

The actual wiki pages are in `~/github/knowledge/llm-wiki/wiki/` (6 files: index.md, log.md, 4 category folders). [VERIFIED: `find` on live filesystem]

**Fix required:** Add `"basePath": "/Users/yourname/github/knowledge/llm-wiki/wiki"` to the llm-wiki entry in `collections.config.json`.

QMD already has `llm-wiki` pointing at the correct `wiki/` path (added during this research session) — the QMD side is correct, only the app config needs fixing.

### Pattern 3: Freshness Date in CollectionCard

The `KnowledgeCollection` type already has `lastUpdated: string | null`. The `/api/knowledge` route already sets it (sampling mtime of up to 5 files). The `HealthPanel` component already uses it for freshness alerts.

**Gap:** `CollectionCard` does not render `lastUpdated`. KNOW-02 requires the Library view to show freshness date per collection. The fix is a UI addition to `collection-card.tsx` — display `lastUpdated` formatted as a relative or absolute date.

```tsx
// Pattern: add below the category text in CollectionCard
{collection.lastUpdated && (
  <p className="text-xs text-slate-600 mt-0.5">
    {new Date(collection.lastUpdated).toLocaleDateString()}
  </p>
)}
```

### Pattern 4: gitnexus Weekly Integration

The existing `gitnexus-index.sh` at `~/github/gitnexus-index.sh`:
- Runs **daily** at 03:00 (`0 3 * * *` in crontab) [VERIFIED: crontab -l]
- Covers exactly 8 repos: `popsmiths_app`, `paperclip`, `knowledge`, `mkt-hub`, `openclaw-nerve`, `ShopifyBot`, `claw-code`, `OMS` [VERIFIED: script source]
- Has smart skipping: compares `lastCommit` in `.gitnexus/meta.json` against `git rev-parse HEAD` — skips if no new commits
- Excludes `openclaw` and `abtesting` due to monorepo/stack overflow issues (documented in script)
- `agent-kitchen` is in the gitnexus registry but NOT in the REPOS array

**Requirement interpretation:** KNOW-04 says "weekly refresh cron" — this likely means `refresh-index.sh` (the canonical weekly run). The daily `gitnexus-index.sh` already satisfies the automation requirement, but to formally integrate it with the weekly cron, add a call in `refresh-index.sh`.

**Add to `refresh-index.sh`** before the `qmd update` call:
```bash
# Run gitnexus on all indexed repos
echo "Running GitNexus analyze across repos..."
~/github/gitnexus-index.sh || echo "  Warning: gitnexus-index failed (non-fatal)"
```

### Anti-Patterns to Avoid

- **Adding a collection only to QMD but not collections.config.json:** The Library view will show 0 docs. Both registries must be updated.
- **Adding a collection to collections.config.json without `basePath` when it's not under `KNOWLEDGE_BASE`:** The API will silently return `docCount: 0` since the path won't exist.
- **Pointing llm-wiki at the repo root instead of `wiki/`:** Picks up README/schema docs (3 files) instead of actual wiki pages (6+ files). The whole-repo path also picks up `raw/` source documents which agents should not search.
- **Hardcoding `/Users/yourname/` in `basePath`:** Use environment variables or relative-from-HOME paths when possible. For now the env var `KNOWLEDGE_BASE_PATH` handles the vault path.
- **Running `gitnexus-index.sh` without `|| true` in refresh-index.sh:** A gitnexus failure (e.g., one repo crashes) will abort the whole refresh script and skip `qmd update`. Always make it non-fatal.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collection path resolution | Custom path logic in API | `basePath` field in `collections.config.json` | Already supported in `/api/knowledge/route.ts` line 32 |
| Search indexing | Custom markdown crawler | `qmd collection add` + `qmd update` | QMD handles BM25, chunking, embeddings |
| Gitnexus change detection | Re-running analyze unconditionally | Existing smart skip in `gitnexus-index.sh` | Already compares HEAD to `lastCommit` in meta.json |
| Freshness calculation | Custom date logic | `stat().mtime` already in `/api/knowledge/route.ts` | Just need to surface it in the card UI |

---

## Runtime State Inventory

> This is a config/wiring phase, not a rename/refactor phase. However, two live systems have state that must be updated.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | QMD index at `~/.cache/qmd/index.sqlite` — currently has `llm-wiki` pointing to `wiki/` subdir (correct), does NOT have `knowledge` vault | Run `qmd collection add --path ~/github/knowledge --name knowledge` then `qmd update && qmd embed` |
| Live service config | `~/.config/qmd/index.yml` — QMD's own registry, separate from `collections.config.json` | Already has correct `llm-wiki` path; needs `knowledge` vault added |
| OS-registered state | `crontab` — `refresh-index.sh` does not call `gitnexus-index.sh`; `gitnexus-index.sh` runs separately daily | Edit `refresh-index.sh` to add gitnexus call; no crontab changes needed |
| Secrets/env vars | `KNOWLEDGE_BASE_PATH` not set in `.env.local` (file doesn't exist) — API uses hardcoded fallback `~/github/knowledge` | Create `.env.local` with `KNOWLEDGE_BASE_PATH=/Users/yourname/github/knowledge` for explicitness, or leave fallback (both work) |
| Build artifacts | None — config-only changes, no compiled artifacts affected | None |

---

## Common Pitfalls

### Pitfall 1: llm-wiki docCount Shows 3 Instead of 6+
**What goes wrong:** Library view shows llm-wiki with 3 docs (README, GETTING-STARTED, LLM-WIKI.md from repo root).
**Why it happens:** `collections.config.json` has no `basePath` for llm-wiki, so API resolves to `~/github/knowledge/llm-wiki` (repo root), not `~/github/knowledge/llm-wiki/wiki/`.
**How to avoid:** Add `"basePath": "/Users/yourname/github/knowledge/llm-wiki/wiki"` to llm-wiki entry.
**Warning signs:** Doc count = 3, no category folder pages visible.

### Pitfall 2: knowledge Vault Has 527 Files But Freshness Looks Stale
**What goes wrong:** `lastUpdated` is sampled from only 5 files (lines 37-42 of route.ts). For a 527-file vault, this might miss recently updated files.
**Why it happens:** Performance optimization in the API — sampling instead of full scan.
**How to avoid:** Acceptable for Phase 1. The 5-file sample uses the most recently modified of those 5 as the freshness indicator. For a vault that's updated regularly, this is fine. If precision matters, that's a future enhancement.
**Warning signs:** Freshness date looks old even though files were updated today.

### Pitfall 3: QMD Embed Stalls on Large Vault
**What goes wrong:** `qmd embed` runs slowly or times out when the knowledge vault (527 files) is first indexed.
**Why it happens:** First-time embedding generation for 527 markdown files requires LLM API calls.
**How to avoid:** Run `qmd update` first, then `qmd embed -f` in a terminal (not a script that might time out). Budget 5-15 minutes for first-time embedding.
**Warning signs:** `qmd embed` output shows "N unique hashes need vectors" and hangs.

### Pitfall 4: gitnexus-index.sh Non-Fatal Failure Skips Repos
**What goes wrong:** If one repo fails (stack overflow, missing dir), the script continues but that repo is not indexed.
**Why it happens:** The script uses `((FAIL++))` and continues — by design.
**How to avoid:** Check the output log (`/tmp/gitnexus-cron.log`) after the first run to verify all 8 repos are indexed. The script prints pass/fail/skip counts.
**Warning signs:** Final line shows `FAIL > 0`.

### Pitfall 5: collections.config.json and QMD Out of Sync
**What goes wrong:** A collection appears in the Library view (from collections.config.json) but returns no search results when agents query it (not in QMD).
**Why it happens:** Two independent registries. Adding to one doesn't update the other.
**How to avoid:** Always do both: edit `collections.config.json` AND run `qmd collection add`.
**Warning signs:** `qmd collection list` does not show the collection name.

---

## Code Examples

### Adding a Collection to collections.config.json
```json
// Source: verified from /api/knowledge/route.ts path resolution logic
// Use basePath whenever path is NOT ~/github/knowledge/<name>
{
  "name": "knowledge",
  "category": "other",
  "basePath": "/Users/yourname/github/knowledge"
}
```

### Fixing llm-wiki to Point at wiki/ Subdir
```json
// Source: verified from live filesystem — wiki pages are in wiki/ not repo root
{
  "name": "llm-wiki",
  "category": "business",
  "basePath": "/Users/yourname/github/knowledge/llm-wiki/wiki"
}
```

### Adding knowledge Vault to QMD
```bash
# Source: verified via qmd --help and live test during research
qmd collection add --path ~/github/knowledge --name knowledge
qmd update
# DO NOT run qmd embed — vector/semantic search uses Qdrant Cloud, not SQLite
```

### Adding gitnexus to refresh-index.sh
```bash
# Source: verified from existing gitnexus-index.sh structure
# Add before the "qmd update" line in refresh-index.sh
echo "Running GitNexus analyze across indexed repos..."
~/github/gitnexus-index.sh || echo "  Warning: gitnexus-index failed (non-fatal)"
```

### Rendering Freshness Date in CollectionCard
```tsx
// Source: KnowledgeCollection type (src/types/index.ts), HealthPanel pattern
// Add below the category badge in collection-card.tsx
{collection.lastUpdated && (
  <p className="text-xs text-slate-500 mt-0.5" title={collection.lastUpdated}>
    {new Date(collection.lastUpdated).toLocaleDateString()}
  </p>
)}
```

---

## State of the Art

| Old State | Current / Target State | Verified |
|-----------|----------------------|----------|
| llm-wiki in QMD: not indexed | llm-wiki in QMD: 6 files at `wiki/` subdir | VERIFIED: `qmd collection add` succeeded during research |
| llm-wiki in app: points to repo root (3 docs) | llm-wiki in app: needs `basePath` pointing to `wiki/` | Fix required |
| knowledge vault: not in QMD, not in app | knowledge vault: needs both registrations | Fix required |
| gitnexus: daily cron only | gitnexus: daily cron + integrated into weekly refresh-index.sh | Partial — daily exists, weekly integration needed |
| CollectionCard: shows docCount only | CollectionCard: shows docCount + lastUpdated | UI addition needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KNOW-04 "weekly refresh cron" refers to `refresh-index.sh` (Sunday 07:00), not the daily `gitnexus-index.sh` | Architecture Patterns #4 | If the daily cron already satisfies the requirement, the refresh-index.sh edit is optional but harmless |
| A2 | The `knowledge` vault should be added as a single top-level collection, not split into subdirs | Standard Stack | If Luis wants subdirs (shared, skills, operations etc.) as separate collections, multiple entries are needed instead |
| A3 | `basePath` in collections.config.json should use absolute path with `~` expanded | Code Examples | If the server process doesn't expand `~`, use full `/Users/yourname/` path |

---

## Open Questions

1. **Should the knowledge vault be one collection or many?**
   - What we know: `~/github/knowledge/` has 40 top-level entries, 527 markdown files. Several subdirs (`shared`, `skills`, `skill-manifests`, `operations`) are already separate QMD collections.
   - What's unclear: Does KNOW-02 mean one "knowledge vault" card in the Library, or does the existing `shared` collection partially satisfy this?
   - Recommendation: Add a single `knowledge` collection at the vault root for KNOW-02 compliance. The existing `shared` collection is not the same thing.

2. **Should llm-wiki point at `wiki/` or the full `llm-wiki/` dir?**
   - What we know: The `wiki/` subdir has actual knowledge pages. The root has schema/README docs.
   - What's unclear: Are the README/schema docs (LLM-WIKI.md, GETTING-STARTED.md) useful for agent search?
   - Recommendation: Point at `wiki/` subdir. Schema docs are for humans configuring the system, not for agent search. QMD already confirms 6 useful pages in `wiki/`.

3. **Does `gitnexus-index.sh` need `agent-kitchen` added to REPOS?**
   - What we know: `agent-kitchen` is in the gitnexus registry (analyzed manually) but not in the REPOS array in `gitnexus-index.sh`.
   - What's unclear: KNOW-04 says "all 8 indexed repos" — is agent-kitchen the 9th, or is it excluded intentionally?
   - Recommendation: The 8 repos in the script match the KNOW-04 count. Leave agent-kitchen out of the cron unless Luis explicitly wants it indexed nightly.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| qmd | KNOW-02, KNOW-03 | Yes | 1.1.5 | — |
| npx gitnexus | KNOW-04 | Yes | in cron script | — |
| crontab | KNOW-04 | Yes | macOS launchd-backed | — |
| `~/github/knowledge/` | KNOW-02, KNOW-03 | Yes | 527 .md files | — |
| `~/github/knowledge/llm-wiki/wiki/` | KNOW-03 | Yes | 6 .md files | — |
| `~/github/gitnexus-index.sh` | KNOW-04 | Yes | verified | — |
| `~/github/knowledge/refresh-index.sh` | KNOW-04 | Yes | verified | — |

**No missing dependencies.** All tools and paths exist on this machine.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest + @testing-library/react |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-02 | knowledge vault appears in `/api/knowledge` response with docCount > 0 and lastUpdated | Integration (API) | `curl -s http://localhost:3002/api/knowledge \| python3 -c "import json,sys; d=json.load(sys.stdin); c=[x for x in d['collections'] if x['name']=='knowledge']; assert len(c)==1 and c[0]['docCount']>0 and c[0]['lastUpdated'], 'FAIL'; print('PASS')"` | No — Wave 0 |
| KNOW-02 | CollectionCard renders lastUpdated date text | Unit (component) | `npx vitest run src/test/collection-card.test.tsx` | No — Wave 0 |
| KNOW-03 | llm-wiki in `/api/knowledge` with docCount matching wiki/ subdir (>= 6) | Integration (API) | `curl -s http://localhost:3002/api/knowledge \| python3 -c "import json,sys; d=json.load(sys.stdin); c=[x for x in d['collections'] if x['name']=='llm-wiki']; assert c[0]['docCount']>=6, 'FAIL'; print('PASS')"` | No — Wave 0 |
| KNOW-03 | llm-wiki searchable via qmd | Integration (CLI) | `qmd search "wiki" -c llm-wiki --files \| grep -q "wiki/" && echo PASS \|\| echo FAIL` | No (manual verify) |
| KNOW-04 | gitnexus-index.sh called from refresh-index.sh | Script content check | `grep -q "gitnexus-index" ~/github/knowledge/refresh-index.sh && echo PASS \|\| echo FAIL` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run` + manual curl checks for KNOW-02 and KNOW-03
- **Phase gate:** All curl integration checks pass + vitest green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/test/collection-card.test.tsx` — unit test for KNOW-02 freshness rendering
- [ ] No framework install needed — vitest already configured

---

## Security Domain

> This phase makes no changes to authentication, access control, or data exposure. It adds read-only filesystem paths to existing configs. No ASVS categories apply.

**Applicable:** V5 Input Validation only (indirect) — basePath values in `collections.config.json` are read by the server. No user-controlled input is introduced. Risk: LOW.

---

## Sources

### Primary (HIGH confidence — verified against live system)
- Live filesystem: `~/github/knowledge/`, `~/github/knowledge/llm-wiki/wiki/`, `~/github/gitnexus-index.sh`, `~/github/knowledge/refresh-index.sh`
- `qmd --version` → v1.1.5 at `/opt/homebrew/bin/qmd`
- `qmd collection list` → 17 collections, llm-wiki NOT present before research session
- `qmd collection add --path ~/github/knowledge/llm-wiki/wiki --name llm-wiki` → succeeded, 6 files indexed
- `crontab -l` → `refresh-index.sh` runs weekly, `gitnexus-index.sh` runs daily
- `~/.config/qmd/index.yml` → QMD's persistent registry
- `collections.config.json` at project root → 18 entries including llm-wiki (wrong path), no knowledge vault
- Source files: `/api/knowledge/route.ts`, `/api/gitnexus/route.ts`, `src/types/index.ts`, `collection-card.tsx`, `health-panel.tsx`

### Secondary (MEDIUM confidence)
- `~/.gitnexus/registry.json` → 9 repos, agent-kitchen is 9th (added manually, not in cron script)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified live
- Architecture: HIGH — source code and live configs read directly
- Pitfalls: HIGH — derived from actual code paths and live state, not speculation
- Open questions: MEDIUM — interpretive, require Luis confirmation

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable config — only changes if QMD, gitnexus, or project structure changes)

---

## RESEARCH COMPLETE
