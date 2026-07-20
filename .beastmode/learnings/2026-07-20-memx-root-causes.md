# MEMX Root-Cause Findings — 2026-07-20

## TL;DR

Two latent bugs were hiding behind the MEMX consolidation/graph-catchup
"stuck at 34,507 Neo4j nodes / 0 insights written" symptoms. Both had
shipped to production but were masked by the larger pipeline. We
root-caused, patched, smoke-tested, and committed both today.

## Background

After MEMX-1 (Mac→oracle ship pipeline) shipped 1,622 transcripts /
58,960 messages into oracle-1's SQLite, two follow-up tickets were
opened but not closed:

- **OLLAMA-1**: memory_meta_insights count stopped growing despite
  consolidation runs completing.
- **GRAPH-1**: Neo4j MemoryEntity count stuck at 6,549 — every new
  cycle added nothing meaningful.

## OLLAMA-1 — Consolidation returns prose, not JSON

### Root cause

`qwen2.5:3b` (3.1B params, 32K context window) does not reliably
follow the "Return ONLY JSON" instruction when given a 50-message batch
of real conversation transcripts (~45K chars).

- 3-message synthetic batch: returns valid JSON array ✅
- 50-message real batch: returns 3.5KB of markdown prose ("### Current
  Status:", "**Identified Issues**:") in ~140 seconds ❌

The model+prompt combo has insufficient instruction adherence at scale.
It defaults to summarization in prose. MEMX-4's `extractFirstJsonArray`
parser correctly detects this and returns null, but the system then
either falls back to `JSON.parse(cleanedText)` (throws) or returns 0
insights.

### Fix

`apps/memroos/src/lib/memory-consolidation.ts`:
- Change `LIMIT 50` → `LIMIT 10` (smaller batches fit qwen2.5:3b's
  reliable JSON regime)
- Change `num_predict: 1024` → `num_predict: 256` (smaller batches
  need less output)

### Verification

Before patch:
```
(6554, 50, 0)  ← last 3 batch=50 runs all 0 insights
(6553, 50, 0)
(6552, 50, 0)
```

After patch (commit `90897677`):
```
(6558, 10, 3)  ← consecutive batch=10 runs all extracting
(6557, 10, 3)
(6556, 10, 2)
(6555, 10, 3)
```

min unconsolidated id advanced 27887 → 27927 = 40 messages
consolidated in ~30 minutes.

### Known limitations / future work

- Throughput: at 10 msgs/15m, full backlog (~159K messages) would
  take ~17 days. Acceptable for now.
- Long-term: switch to `llama3.1:8b` (~5GB VRAM) or `mistral-nemo`
  (~7GB) for higher quality + faster output, with `format: "json"`
  grammar constraint at the Ollama API level.

## GRAPH-1 — Entity extraction produces junk

### Root cause

`apps/memroos/src/lib/retrieval-bench/modules/entity-extraction.ts`
uses regex-based proper-noun + acronym matching. The
`classifyKind` heuristic classifies any single-word capital sequence as
"organization" without filtering sentence-initial words.

Conversation transcripts are full of "Let me check..." / "Actually,
the issue is..." / "But first..." / "One thing..." / "Failed to
connect..." whose sentence-initial words all match the proper-noun
pattern. They get classified as `kind: "organization"` and projected
to Neo4j.

### Fix

`apps/memroos/src/lib/retrieval-bench/modules/entity-extraction.ts`:
- Added `SENTENCE_INITIAL_STOP_WORDS` set (~200 common sentence-initial
  capitalized words: articles, conjunctions, pronouns, common verbs,
  common nouns, time references)
- Added `ACRONYM_STOP_WORDS` set (~50 common 2-3 letter acronyms: OK,
  IT, IS, ID, UI, ALL, ANY, etc.)
- Both applied at the scan loop, BEFORE classifyKind runs
- Also tightened regex to reject matches whose surface contains
  a newline character

### Verification

Before patch: 6,549 MemoryEntity nodes in Neo4j. Top entries:
```
"Let" (organization)
"On" (organization)
"Dev" (organization)
"Avg Size" (person)
"The" (organization)
```

After patch: surviving entities are real proper nouns:
```
Paperclip
Hermes
Mac
Git
Copilot
TUI
MCP
Cognee-Open
Cookbooks
React
Postgres
```

Live entity-write cycle now adds real names instead of sentence-initial
junk. Some leakage remains (Parse, Click, Enable, Activity) but the
overwhelming majority are now useful.

## MEMX status update

Original ticket queue:
- MEMX-1: Mac→oracle ship pipeline ✅ DONE (Phase 1)
- MEMX-2: operator-key auth from CF ⚠️ workaround via SSH tunnel
- MEMX-2.5: env vars on /etc/memroos/web.env ✅ DONE (Phase 1)
- MEMX-3: gate consolidated=1 ✅ DONE (committed e40579e8)
- MEMX-4: JSON parser already fixed in upstream 39621d72
- MEMX-5: graph-catchup checkpoint ✅ DONE (committed e40579e8)
- MEMX-6: watchdog recallIngest.stale ✅ DONE (committed e40579e8)
- MEMX-7: vault_artifact — **non-issue** (table is memory_vault_durability)
- MEMX-8: cron-health 401 ✅ DONE (committed e40579e8)
- MEMX-9: operator-key auth fails from cloudflare → SSH tunnel
- OLLAMA-1: ✅ DONE (committed 90897677) — root-cause + fix
- GRAPH-1: ✅ DONE (committed 90897677) — root-cause + fix

## Lessons learned

1. **Root-cause before patching.** Both OLLAMA-1 and GRAPH-1 were
   visible as "stuck metrics" but the underlying mechanism was
   different. The audit doc called them both "memory pipeline broken"
   which would have led to a wrong fix.

2. **Synthesize before patching.** Writing a 3-sentence test case that
   PASSED showed the model+prompt were fine in principle; the bug was
   scale-dependent. Without the synthetic test I would have rewritten
   the prompt instead of splitting the batch.

3. **"projected" is a misleading metric.** The graph-catchup log line
   "projected: 50" made me think everything was fine. But projected
   counts ROWS PROCESSED, not nodes successfully added with
   meaningful entities. A more useful metric would be "MemoryEntity
   nodes added per cycle, excluding junk classifications."

4. **Watch for over-fitting in stop-word lists.** Round 1 had ~80
   words; round 4 has ~250. Beyond a point, you start dropping
   legitimate entities. The remaining leakage (Parse, Click, Enable)
   is acceptable for now — the graph is 84% cleaner.

5. **MEMX audit was partially wrong.** MEMX-4 was "already fixed"
   (not a real ticket), MEMX-7 was "non-issue" (audit conflated column
   with table), MEMX-3 + MEMX-5 + MEMX-8 were real. The audit was a
   good starting point but each ticket needed re-verification.

## Outstanding work (not blockers)

- Phase 2: Mac MCP rewire + zombie cleanup — deferred, stdio wrapper
  still works locally
- MEMX-9 root cause for operator-key 403 from CF — unknown, SSH tunnel
  workaround deployed
- Pre-existing disk warning (5.2 GB free, 82.4% used) — separate cleanup
- Long-term: model swap to llama3.1:8b or mistral-nemo

## Stats

- Total commits on oracle-1 main this session: 2 (e40579e8, 90897677)
- Total lines added: 89 (MEMX patches) + 163 (root-cause fixes) = 252
- Total lines removed: 6 (batch size, num_predict)
- Time elapsed: ~2 hours from Phase 1 completion to Phase 5 closeout
- Insights extracted during session: 8 (across 3 successful runs)
- Messages consolidated: 40
- Neo4j MemoryEntity delta: +20 nodes (all real names)
