# MemRoOS Memory-Flow Verification Map

**Owner:** Luis Calderon · **Authored:** 2026-07-19 · **Scope:** End-to-end memory ingest → write → retrieve → consolidate → graph on oracle-1 production.

---

## 0. Production target (read-only facts)

- **Operator host:** `oracle-1` (Tailscale `100.90.196.33`), Cloudflare tunnel `memroos-oracle` → `http://127.0.0.1:3000` → public `https://memroos.epiloguecapital.com`.
- **Runtime units (oracle-1):** `memroos-web.service` (Next.js, `:3000`), `memroos-mem0.service` (mem0 FastAPI, `:3201`), `ollama.service` (embeddings), `cloudflared.service`.
- **Local checkout:** `/home/opc/github/memroos`. SQLite at `SQLITE_DB_PATH` → `/home/opc/github/memroos/data/conversations.db`.
- **Disk watch:** `memroos-disk-watch.timer` every 30m; warns ≤6G free, critical ≤4G (`/var/log/memroos/disk-watch.log`).
- **Mem0 vector store:** Qdrant Cloud (`https://f969d77f-…aws.cloud.qdrant.io:6333`, collection `agent_memory_local`); key in `QDRANT_API_KEY`.
- **Embeddings:** Ollama `nomic-embed-text` (768 dims). **LLM (fact extraction + consolidation):** Ollama `qwen2.5:3b`.
- **Graph tier:** Neo4j Aura; HTTP via `NEO4J_HTTP_URL` + `NEO4J_PASSWORD` (env).
- **Authoritative doc:** `docs/production-deployment.md` (v2.0, 2026-07-18).

> macOS local data dir at `/Users/lcalderon/github/memroos/data/conversations.db` is **563 MB** with a 5 MB WAL — dev shadow of production. Logs under `services/memory/logs/` show mem0 + graph-catchup launchd activity through 2026-07-19 15:45, and a non-zero `healthcheck-launchd-error.log` (13 KB) worth a glance during prod probes.

---

## 1. Live APIs / DB tables (production paths)

### 1.1 Ingest paths → `messages` + `messages_fts`

| Producer | Entry | Sink | Code |
|---|---|---|---|
| File scanner (Claude/Qwen/Hermes/Codex JSONL) | `POST /api/recall/ingest` (operator) → `ingestAllSessions()` | `INSERT OR IGNORE INTO messages` + `INSERT INTO messages_fts` (FTS5 trigger) + writes `vault_artifacts` | `apps/memroos/src/app/api/recall/ingest/route.ts`, `apps/memroos/src/lib/db-ingest.ts` |
| Slack events | `POST /api/integrations/slack/events` → `ingestPlatformMessageMemory()` | `messages` (via `insertMessageRow`) + `platform_message_memory` (dedupe-keyed) | `apps/memroos/src/app/api/integrations/slack/events/route.ts`, `apps/memroos/src/lib/message-memory/store.ts` |
| Operator telemetry feed | `POST /api/operations/telemetry` → `ingestPlatformMessageMemory()` | `messages` + `platform_message_memory` | `apps/memroos/src/app/api/operations/telemetry/route.ts` |
| Hermes dual-mode plugin | `POST /api/native-memory/ingest` (Bearer operator/agent key) → `processNativeMemoryIngest()` | **No write.** Returns sanitized `replay`. Hermetic sink. | `apps/memroos/src/app/api/native-memory/ingest/route.ts`, `apps/memroos/src/lib/native-memory/sink.ts` |

DB tables populated: `messages` (canonical), `messages_fts` (FTS5 mirror, populated by triggers), `platform_message_memory` (provider mirror), `vault_artifacts` (durable replay body), `ingest_meta` (file mtime/size dedupe).

### 1.2 Memory writes (programmatic)

| Caller | Sink | Code |
|---|---|---|
| `POST /api/memory/add` (agent auth, rate-limit 30/min) | `recordMemoryWrite()` → `agent_memory_writes` + `efficiency_events(memory_write)` | `apps/memroos/src/app/api/memory/add/route.ts`, `apps/memroos/src/lib/agent-registry.ts:469` |
| `POST /api/agent-context/messages` / `[id]/reply` (saveToMemory) | same `recordMemoryWrite()` | `apps/memroos/src/app/api/agent-context/messages/route.ts` |
| `POST /api/chatgpt/actions` save flow | same `recordMemoryWrite()` | `apps/memroos/src/lib/chatgpt-actions.ts` |
| Vector adapter writes | `VectorMemoryAdapter.write()` (POST to mem0) | `apps/memroos/src/lib/memory/backends.ts:443` |

> ⚠ **Observation:** `recordMemoryWrite()` does **not** call the VectorMemoryAdapter — it only writes the audit row in `agent_memory_writes`. The `multi-search` route calls `searchVectorMemory(query, limit)` (vector) **and** `queryGraphMemory(query, limit)` (graph) **and** `parseClaudeMemory(CLAUDE_MEMORY_PATH)` (episodic from JSONL files), so vectors are populated by the **mem0/Qdrant ingestion pipeline only**, not by the API routes that call `recordMemoryWrite`. Any “memory not being saved” complaint should be triaged against the mem0 pipeline + queue, not `/api/memory/add`.

### 1.3 Retrieval paths

| Route | Tiers | Notes |
|---|---|---|
| `POST /api/recall` | `messages_fts` (BM25) + embeddings (hybrid) | `apps/memroos/src/app/api/recall/route.ts`; uses `recallByKeyword()` + `embedText()` |
| `GET /api/memory/search` | vector (`searchVectorMemory`) | `apps/memroos/src/app/api/memory/search/route.ts` |
| `GET /api/memory/graph` | graph (`queryGraphMemory`) | `apps/memroos/src/app/api/memory/graph/route.ts` |
| `GET /api/memory/multi-search` | vector + graph + episodic (`parseClaudeMemory`) in parallel, returns truthful per-tier `metric.status` (live/empty/blocked/error/degraded) | `apps/memroos/src/app/api/memory/multi-search/route.ts` |
| `GET /api/memory` | raw mem0 + raw claude-JSONL dump | `apps/memroos/src/app/api/memory/route.ts` |
| `GET /api/memory/health` | mem0 vector + Neo4j + episodic + last-ingest staleness | `apps/memroos/src/app/api/memory/health/route.ts` |

All reads pass `filterAuthorizedMemoryItems()` (`apps/memroos/src/lib/memory/policy-gate.ts`) for policy-gated visibility.

### 1.4 Consolidation

- `apps/memroos/src/lib/memory-consolidation.ts`: every 15m (`startConsolidationScheduler`), selects up to 50 `messages WHERE consolidated=0`, calls Ollama `qwen2.5:3b` for `{pattern|contradiction|summary}` insights, writes `memory_meta_insights`, marks `messages.consolidated=1`.
- Manual: `POST /api/memory-consolidate` (operator role). Telemetry: `GET /api/memory-stats` returns `pendingUnconsolidated`, `lastRun`, `recentFailures24h`, `tierStats`, `sources`.
- Backoff: 60m after a 429/rate-limit failure (`CONSOLIDATION_PROVIDER_BACKOFF_MINUTES`).

### 1.5 Graph catchup (episodic + vector → Neo4j `:MemoryFact` + `:MemoryEntity` + `:MENTIONS`)

- Engine: `apps/memroos/src/lib/memory/graph-catchup.ts`. Pages `messages WHERE id > checkpoint.episodicLastId` and Qdrant `scroll` (preferred when `QDRANT_URL` set) OR legacy `mem0 /memory/all` (capped ~100).
- Writes idempotent `MERGE (n:MemoryFact {id})`, then optional `MERGE (n:MemoryEntity)` + `MENTIONS` from `extractEntities()`.
- Checkpoint table `graph_catchup_checkpoints` (`id='default'`).
- Scheduler: `startGraphCatchupScheduler()` runs every 30m, gated by `cron-health` and `isNeo4jConfigured()`.
- Manual: `POST /api/memory-lifecycle/graph-catchup` (Bearer agent/operator key), `body.oneshot=true` for full rebuild.
- Env knobs: `GRAPH_CATCHUP_WRITE_DELAY_MS` (default 200ms), `GRAPH_CATCHUP_AGENT_ID`, `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` (default `agent_memory_local`).

### 1.6 Mem0 service (Python)

- `services/memory/mem0-server.py` (FastAPI, port `3201`): mem0 with Qdrant backend, CircuitBreaker around `Memory()`, PII guard (`pii_guard.protect_memory_payload`), notify on state transitions.
- `services/memory/mem0_queue.py`: SQLite-backed replay queue (`logs/queue.db`) — buffers failed `POST`/`GET` to mem0 when 408/409/425/429/5xx or retryable markers; daemon thread `REPLAY_INTERVAL=10s`.
- `services/memory/mem0-config.yaml` (prod) → Qdrant Cloud + Ollama `qwen2.5:3b` + `nomic-embed-text` (768).
- `services/memory/mem0-config.demo.yaml` → Chroma (local) — for demos only.

### 1.7 Integration plugin (Hermes)

- `integrations/hermes/plugins/memory/memroos/__init__.py`: dual-mode `observe|governed`. **Default = `observe`. Hard rule: never rewrites `MEMORY.md` in v1.** POSTs to `/api/native-memory/ingest` with Bearer key (`MEMROOS_AGENT_API_KEY`/`MEMROOS_OPERATOR_API_KEY`). Fail-open (ingest errors never block Hermes).

---

## 2. Test & diagnostic inventory (already in repo)

### 2.1 Unit tests for the memory layer

| File | Coverage |
|---|---|
| `apps/memroos/src/lib/memory/__tests__/adapters.test.ts` | VectorMemoryAdapter / GraphMemoryAdapter write + health contract (MEM-08) |
| `apps/memroos/src/lib/memory/__tests__/backends-health-timeout.test.ts` | per-tier health/timeout |
| `apps/memroos/src/lib/memory/__tests__/backends-disk-vector.test.ts` | disk-vector fallback path |
| `apps/memroos/src/lib/memory/__tests__/consolidation.test.ts` | runConsolidation with stub Ollama |
| `apps/memroos/src/lib/memory/__tests__/graph-catchup.test.ts` | episodic+vector projection (in-memory `queryFn` mock) |
| `apps/memroos/src/lib/memory/__tests__/erasure.test.ts`, `erasure-adapters.test.ts`, `subject-erasure.test.ts`, `retention-expiry.test.ts`, `vault-durability.test.ts`, `qmd.test.ts`, `policy-gate.test.ts`, `security-regression.test.ts`, `embedding-lifecycle.test.ts` | full audit + DSAR + lifecycle suite |
| `apps/memroos/src/app/api/memory/__tests__/add-route.test.ts`, `multi-search-route.test.ts`, `tier-routes.test.ts` | route-layer truthfulness + rate-limit |
| `apps/memroos/src/app/api/memory-lifecycle/__tests__/consolidation-route.test.ts`, `route.test.ts` | lifecycle handlers |
| `apps/memroos/src/app/api/memory-stats/__tests__/route.test.ts` | truthful envelopes |
| `apps/memroos/src/lib/message-memory/__tests__/message-memory.test.ts` | dedupe + insert transaction |
| `apps/memroos/src/lib/native-memory/__tests__/native-memory-sink.test.ts`, `hermes-dual-mode-contract.test.ts` | hermetic sink contract |
| `apps/memroos/src/lib/__tests__/db-ingest.test.ts`, `memory-inventory.test.ts`, `memory-retention-expiry-scheduler.test.ts`, `memory-recall-evals.test.ts`, `memory-recall-evals-qmd.test.ts`, `memory-policy-lab.test.ts` | ingest + retention + recall evals + policy lab |
| `services/memory/tests/test_mem0_queue.py` | queue dedupe + replay semantics |
| `services/memory/tests/test_mem0_hang_immunity.py` | breaker resilience |
| `services/memory/tests/test_pii_guard.py` | PII redaction |
| `services/memory/tests/test_path_scoped_disk.py` | disk-vector path |
| `services/knowledge-mcp/tests/test_memory_recall.py`, `test_knowledge_system.py`, `test_knowledge_labels.py`, `test_tenant_isolation.py` | knowledge MCP |
| `integrations/hermes/plugins/memory/memroos/tests/test_memroos_provider.py` | plugin contract |

### 2.2 In-process diagnostics (already shipping)

- `buildMemoryDoctorDiagnostic()` (`apps/memroos/src/lib/memory-doctor.ts`) — embeddable in `/api/chat` (`/doctor memory`), shows: indexable/embedded counts, embedding backlog, Discord FTS gap, last Discord msg, local footprint, recommended repair + required checks.
- `/api/memory/health` — three-tier health + recall-ingest staleness (`MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS=24`).
- `/api/memory-stats` — last consolidation run, failures, tierStats, sources.
- `services/memory/healthcheck.sh` — launchd health probe; writes `healthcheck-status.json`.
- `cron-health` table + `recordCronHealthRun()` — heartbeat for `graph-catchup`, `consolidation`, `retention-expiry`, `graph-catchup` (also `message-memory ingest`, etc.).

---

## 3. Minimal end-to-end verification plan (production-safe, read-only first)

> Designed to be runnable by an operator from the Mac against `oracle-1`. **All commands are read-only** unless explicitly marked **[WRITE]**. Secrets use env vars — never inline.

### 3.1 Backend liveness (≤30s)

```bash
# 1. Tunnel + operator brain
curl -sS -o /dev/null -w "%{http_code}\n" https://memroos.epiloguecapital.com/api/health
# 2. Memory-tier health + recall-ingest staleness
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory/health | jq '.tiers,.recallIngest'
# 3. Per-tier truthful envelope via multi-search
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  'https://memroos.epiloguecapital.com/api/memory/multi-search?q=luis&limit=5' \
  | jq '.tiers[] | {tier,count,metric:{status:.metric.status,reason:.metric.reason}}'
```

**Expected:** `vector.status=up`, `graph.status=up` (or `not_configured` only if Neo4j intentionally off), `episodic.count>0`, `recallIngest.status=up`. If `multi-search` shows `error` for any tier, the truthful envelope pinpoints it.

### 3.2 Smoke-write one observation, round-trip (≤60s) — **[WRITE, isolated marker]**

```bash
TAG="probe-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
# 1. Add through the canonical API (writes agent_memory_writes + efficiency_events)
curl -sS -X POST -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"probe-agent\",\"content\":\"$TAG verifier: MemRoOS memory probe — please ignore\",\"type\":\"episodic\"}" \
  https://memroos.epiloguecapital.com/api/memory/add
# 2. Hit the Qdrant Cloud collection directly (read-only) — search for the marker
curl -sS -X POST -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  "https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333/collections/agent_memory_local/points/scroll" \
  -d '{"limit":5,"with_payload":true,"filter":{"should":[{"key":"memory","match":{"text":"'"$TAG"'"}}]}}'
# 3. Confirm no leakage into sealed/private visibility (policy gate)
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  "https://memroos.epiloguecapital.com/api/memory/multi-search?q=$TAG&limit=5" \
  | jq '.tiers[] | select(.tier=="vector") | .metric'
```

**Expected:** (1) 200 + `ok:true` from `/api/memory/add`. (2) Qdrant returns `result.points[]` containing the marker within ≤5s. (3) vector tier returns `metric.status=live` with at least one authorized hit. **If (2) returns empty after 30s**: mem0 queue has buffered — check `services/memory/logs/queue.db` rows (`SELECT COUNT(*), endpoint, method FROM queued_requests GROUP BY endpoint,method`).

### 3.3 Episodic path probe (≤30s) — read-only

```bash
# 1. Confirm FTS covers recent messages
sqlite3 /home/opc/github/memroos/data/conversations.db \
  "SELECT 'messages'      AS t, COUNT(*) FROM messages;
   SELECT 'messages_fts'  AS t, COUNT(*) FROM messages_fts;
   SELECT 'platform_mm'   AS t, COUNT(*) FROM platform_message_memory;
   SELECT 'last_ingest'   AS k, value  FROM meta WHERE key='last_ingest_ts';"
# 2. Confirm at least one row landed in messages_fts for project='platform:discord' (Discord mirror check)
sqlite3 /home/opc/github/memroos/data/conversations.db \
  "SELECT COUNT(*) AS discord_msgs FROM messages WHERE project='platform:discord';
   SELECT COUNT(*) AS discord_fts  FROM messages_fts
     WHERE rowid IN (SELECT id FROM messages WHERE project='platform:discord');"
# 3. Direct recall query for an obvious term (e.g., 'memroos')
sqlite3 /home/opc/github/memroos/data/conversations.db \
  "SELECT COUNT(*) FROM messages_fts WHERE messages_fts MATCH 'memroos';"
```

**Expected:** `last_ingest` recent (<= 24h); `discord_msgs == discord_fts`; non-zero FTS hits for known terms.

### 3.4 Consolidation cycle (≤120s) — **[WRITE]**

```bash
# 1. Before
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory-stats \
  | jq '.pendingUnconsolidated,.lastRun,.recentFailures24h'
# 2. Force one cycle
curl -sS -X POST -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory-consolidate | jq
# 3. After
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory-stats | jq '.lastRun'
```

**Expected:** `pendingUnconsolidated` drops, `lastRun.status=completed`, `insights_written>0` when backlog>0. If `failed`: tail `services/memory/logs/failures.log` and the Ollama unit on oracle-1 (`sudo systemctl status ollama`).

### 3.5 Graph catchup cycle (≤180s) — **[WRITE, idempotent MERGEs]**

```bash
# 1. Before
curl -sS -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory-lifecycle/graph-catchup \
  | jq '.checkpoint'
# 2. One-shot rebuild (bounded; safe because Cypher is MERGE)
curl -sS -X POST -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"oneshot":true,"maxPoints":500,"batchSize":50,"projectEntities":true}' \
  https://memroos.epiloguecapital.com/api/memory-lifecycle/graph-catchup | jq '.summary'
# 3. After — checkpoint must advance
curl -sS -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  https://memroos.epiloguecapital.com/api/memory-lifecycle/graph-catchup \
  | jq '.checkpoint'
```

**Expected:** `episodicLastId` advances; `status="completed"` or `"partial"`; `errors` ≤ ~1% of `considered`. If `failed` with `vector_fetch_failed`, Qdrant Cloud is down — verify `QDRANT_URL` reachability from oracle-1 first.

### 3.6 Hermetic Hermes sink (≤30s) — **[WRITE, no DB impact]**

```bash
curl -sS -X POST -H "Authorization: Bearer $MEMROOS_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"hermes","agentId":"probe-hermes","userId":"probe","content":"","memoryPath":"~/.hermes/MEMORY.md"}' \
  https://memroos.epiloguecapital.com/api/native-memory/ingest | jq '.policy,.budgetStatus,.filter.redacted'
# Also test the hermetic contract: content MUST NOT have been written to any messages row
sqlite3 /home/opc/github/memroos/data/conversations.db \
  "SELECT COUNT(*) FROM messages WHERE agent_id='probe-hermes';"
```

**Expected:** `policy.neverDelete=true`, `filter.redacted` honors redaction patterns, **zero** new rows in `messages`.

### 3.7 Audit + policy gate (≤30s) — read-only

```bash
# Confirm policy gate blocks unlabeled external vector hits (fails-closed)
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  "https://memroos.epiloguecapital.com/api/memory/multi-search?q=test&limit=10" \
  | jq '.tiers[] | select(.tier=="vector" or .tier=="graph") | .metric.status'
# Confirm DSAR pipeline (redaction pathway — read schema only, don't delete)
curl -sS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  https://memroos.epiloguecapital.com/api/security/capabilities | jq '.memory.recall,.memory.erasure'
```

**Expected:** `metric.status ∈ {live,empty,blocked,error}` — no silent `zero`/`null` ambiguity.

---

## 4. Coverage gaps (findings)

> Listed in descending risk. Each gap is testable in-place against oracle-1 with the commands above.

### 4.1 Vector writes vs `recordMemoryWrite` mismatch (HIGH)

`/api/memory/add` (and `agent-context/messages` saveToMemory) only writes the `agent_memory_writes` audit row + `efficiency_events` — **it does not call `VectorMemoryAdapter.write()`**. The vector tier is populated exclusively by the **mem0 ingestion pipeline** (mem0-server + mem0_queue + Qdrant). If the user complaint is "memory isn't being saved", the actual write path is whatever calls `mem0 /memory` directly — likely:

- Hermes plugin → `POST /api/native-memory/ingest` (but sink is hermetic — does NOT persist)
- Agent-direct mem0 client (`integrations/.../memroos` plugin)
- Background batch embed (`services/memory/batch-embed*.sh` launchd jobs) — `batch-embed.log` last touched 2026-06-28 → **stale**

**Verification:** the `probe-…` smoke-write in §3.2 hits `mem0` via direct Qdrant query. If that fails, the **batch embed pipeline is the highest-probability suspect**. There is no test in repo that asserts `/api/memory/add` produces a vector hit; existing `add-route.test.ts` only checks the audit row.

### 4.2 `graph-catchup-launchd-error.log` shows recurring failures (HIGH)

`/Users/lcalderon/github/memroos/services/memory/logs/graph-catchup-launchd-error.log` is **13 KB, last touched 2026-07-19 15:41** — non-zero local shadow. The macOS-side launchd wrapper is firing errors even though the Next.js in-process scheduler also runs. **Two parallel schedulers** (launchd + Next.js `setInterval`) is the most likely culprit for duplicate work and stale checkpoints.

**Verification:** SSH oracle-1 and compare `systemctl list-timers --all | grep memroos` with `crontab -l` and the Next.js scheduler (already in `instrumentation.ts`). Coverage gap: no test asserts at-most-one-scheduler invariant.

### 4.3 `healthcheck-launchd-error.log` is non-empty (MEDIUM)

13 KB of healthcheck errors at `/Users/lcalderon/github/memroos/services/memory/logs/healthcheck-launchd-error.log`. Likely transient, but indicates the local launchd health probe is misbehaving. Worth reading on production host too (`/var/log/memroos/` paths).

### 4.4 Consolidation is Ollama-only, model `qwen2.5:3b` (MEDIUM)

`memory-consolidation.ts:39` hard-codes the consolidation model via env, default `qwen2.5:3b`. The `memory-stats` route surfaces `consolidationModel` but there's **no test for back-pressure when Ollama is slow** beyond `currentProviderBackoff`. The 60-min cooldown after 429 is the only rate-limit gate; throughput is unbounded otherwise. If Ollama is slow but not 429-ing, `runConsolidation` blocks 15min cycles indefinitely.

**Verification:** `curl /api/memory-stats` after a forced run; if `lastRun.status="running"` for >2 cycles, Ollama is hung.

### 4.5 Graph catchup legacy path branches on `QDRANT_URL` only (MEDIUM)

`graph-catchup.ts:531-535` defaults `useQdrantScroll=true` when `QDRANT_URL` set. If env is missing (or temporarily unset during a deploy), it silently falls back to mem0 `/memory/all` which is **capped ~100** — i.e., a single batch will silently truncate large backlogs. No `metalog.warn()` on the fallback path.

**Verification:** in §3.5, if `considered < (rows in messages - checkpoint.episodicLastId)`, suspect a fallback path.

### 4.6 Multi-search fails-closed, but empty vector may mask writes (MEDIUM)

`buildTierEnvelope()` returns `status="empty"` when `rawCount==0 && sourceOk`. This is correct, but operators reading `/api/memory/multi-search` may interpret `"empty"` as "search backend is broken". The contract test (`multi-search-route.test.ts:144-180`) covers this, but the **NOC dashboard** (`apps/memroos/src/components/operations/memory-consumption.tsx`) is the surface most operators will see — no test asserts the UI surfaces `blocked` distinctly.

### 4.7 Recall-ingest staleness threshold is env-only (LOW)

`MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS` default 24h — there's no warning tier (12h, 6h), only `up|stale`. The `health` route is binary. Consider three-tier `up|warning|stale` if more granular SLOs are wanted.

### 4.8 No end-to-end probe in CI (LOW–MEDIUM)

Repo has ~40 memory unit tests but no integration test that hits **live mem0 + live Qdrant + live Neo4j**. The closest is `apps/memroos/src/lib/memory/__tests__/graph-catchup.test.ts` which mocks `queryFn`. CI therefore cannot catch §4.5 regressions.

**Verification gap:** consider adding a smoke test in `apps/memroos/src/lib/memory/__tests__/live-stack.test.ts` (gated by `MEMROOS_LIVE_PROBE=1`) that hits `MEM0_URL` + `QDRANT_URL` + `NEO4J_HTTP_URL` from `process.env` and runs the smoke-write from §3.2.

### 4.9 No batch-embed log activity since 2026-06-28 (LOW)

`services/memory/logs/batch-embed.log` mtime 2026-06-28, `batch-embed-error.log` 2026-06-28 — and the `batch-embed.lock/pid` directory still exists. Production may have a stale PID or a dead launcher. No heartbeat on this worker in the in-process schedulers.

**Verification:** on oracle-1, `systemctl --type=service --state=running | grep -i memroos` should list `memroos-web`, `memroos-mem0`, `ollama`, `cloudflared`. Anything else (e.g., `memroos-batch-embed`) needs investigating.

### 4.10 Hermes dual-mode is opt-in only (LOW)

`is_available()` returns `true` even without URL/key so setup can complete offline. That means a deployed Hermes with the provider enabled but no operator URL **silently never writes** — receipts are appended to `~/.hermes/memroos-memory/observe-receipts.jsonl` but no error is raised.

**Verification gap:** no test asserts the receipts file exists & grows when dry-run is off and the operator URL is reachable.

---

## 5. Root-cause triage playbook (when "memory isn't being saved")

| Symptom | First probe | Likely root cause |
|---|---|---|
| Multi-search returns `vector.status=error` | `curl /api/memory/health` + `systemctl status memroos-mem0` | mem0 service down → queue (`logs/queue.db`) buffering |
| Multi-search returns `vector.status=empty` | `SELECT COUNT(*) FROM queued_requests` in `services/memory/logs/queue.db`; tail `mem0-server.log` | queue stalled or Ollama embedding API hung |
| Multi-search returns `graph.status=error` | `NEO4J_HTTP_URL` env in `/etc/memroos/web.env`; `curl $NEO4J_HTTP_URL` from oracle-1 | Neo4j password missing/changed or Aura outage |
| Consolidation stuck | `lastRun.status` from `/api/memory-stats` | Ollama `qwen2.5:3b` not pulled or `ollama.service` not running |
| `recordMemoryWrite` happening but no vector hit | `/api/memory/add` route — confirm this is **not** the write path for vectors (§4.1) | vector ingestion only happens via mem0 direct calls; check batch-embed (§4.9) |
| Discord messages missing from FTS | `discordMissingFts` from `/doctor memory` | recall-ingest cron not running; `MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS` may be exceeded |

---

## 6. Proposed minimal verification script (single operator entry point)

> Drop-in addition to `scripts/`. No production writes unless `WRITE=1`.

```bash
#!/usr/bin/env bash
# verify-memory-flow.sh — minimal end-to-end probe (production-safe).
set -euo pipefail
HOST=${MEMROOS_HOST:-https://memroos.epiloguecapital.com}
WRITE=${WRITE:-0}
echo "==> $HOST  (WRITE=$WRITE)"
curl -fsS "$HOST/api/memory/health" | jq '.tiers,.recallIngest'
curl -fsS -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  "$HOST/api/memory/multi-search?q=luis&limit=3" \
  | jq '.tiers[] | {tier,count,status:.metric.status}'
[[ "$WRITE" == "1" ]] && curl -fsS -X POST -H "Authorization: Bearer $MEMROOS_OPERATOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"probe\",\"content\":\"verify-$(date +%s)\",\"type\":\"episodic\"}" \
  "$HOST/api/memory/add"
```

---

## 7. Files referenced (authoritative, exact paths)

**API routes (ingest / write / retrieve / lifecycle):**
- `apps/memroos/src/app/api/recall/ingest/route.ts`
- `apps/memroos/src/app/api/recall/route.ts`
- `apps/memroos/src/app/api/memory/add/route.ts`
- `apps/memroos/src/app/api/memory/search/route.ts`
- `apps/memroos/src/app/api/memory/graph/route.ts`
- `apps/memroos/src/app/api/memory/multi-search/route.ts`
- `apps/memroos/src/app/api/memory/health/route.ts`
- `apps/memroos/src/app/api/memory/route.ts`
- `apps/memroos/src/app/api/memory-stats/route.ts`
- `apps/memroos/src/app/api/memory-consolidate/route.ts`
- `apps/memroos/src/app/api/memory-lifecycle/graph-catchup/route.ts`
- `apps/memroos/src/app/api/native-memory/ingest/route.ts`
- `apps/memroos/src/app/api/integrations/slack/events/route.ts`
- `apps/memroos/src/app/api/operations/telemetry/route.ts`
- `apps/memroos/src/app/api/agent-context/messages/route.ts`

**Libraries (orchestration):**
- `apps/memroos/src/lib/db-ingest.ts`
- `apps/memroos/src/lib/db-schema.ts`
- `apps/memroos/src/lib/agent-registry.ts` (`recordMemoryWrite`)
- `apps/memroos/src/lib/memory/backends.ts`
- `apps/memroos/src/lib/memory/graph-catchup.ts`
- `apps/memroos/src/lib/memory-consolidation.ts`
- `apps/memroos/src/lib/memory-graph-catchup-scheduler.ts`
- `apps/memroos/src/lib/memory-doctor.ts`
- `apps/memroos/src/lib/message-memory/store.ts`
- `apps/memroos/src/lib/native-memory/sink.ts`
- `apps/memroos/src/instrumentation.ts`

**Mem0 backend (Python):**
- `services/memory/mem0-server.py`
- `services/memory/mem0_queue.py`
- `services/memory/mem0-config.yaml`
- `services/memory/healthcheck.sh`

**Integration plugin:**
- `integrations/hermes/plugins/memory/memroos/__init__.py`

**Docs:**
- `docs/production-deployment.md`
- `docs/architecture.md`
