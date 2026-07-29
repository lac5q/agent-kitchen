# Logging Observability Audit — 2026-07-19

Backlog status: surfaced to `.planning/ROADMAP.md` as `v8.17 Logging Observability Backlog` candidate; `LOG-01..LOG-12` paste-ready requirements below for `REQUIREMENTS.md` when promoted.

## Current State (2026-07-19)

### Next.js operator app (`apps/memroos/src/`)

- **No structured logger.** No `logger.ts`/`logging.ts` exists under `src/lib/`.
- **No logger dependency.** `pino`/`winston`/`bunyan` not in `package.json`.
- **19 files** in `src/lib/` call `console.*` directly.
- **5 files** in `src/app/api/` call `console.*` directly.
- Hot paths: `lib/memory-consolidation.ts` (5 calls), `lib/memory/graph-catchup.ts` (7 calls), `lib/memory-decay.ts`, `lib/embeddings/embedding-job.ts`, `lib/seal/audit.ts`, `lib/l3/poller.ts`, `lib/hil/sla-{scheduler,actions}.ts`, `lib/evals/engine.ts`, `lib/l3/adapters/{intercom,quickbooks,hubspot}.ts`, `app/api/memory/add/route.ts`, `app/api/escalations/route.ts`.
- Format is ad-hoc: `console.log('[consolidation] scheduler started')` — no level field, no correlation ID, no structured payload. Stdout only.
- **Agent context bus (`lib/agent-context-bus.ts`)** uses 0 `console.*` calls — silent failures are invisible.

### Python services

- `services/memory/mem0-server.py` ✅ already wired: `logging` + `RotatingFileHandler` (50MB × 5), separate `failures.log`, stdout tee. Notify via `notify.py` → Discord/Telegram/Slack/`alerts.log`.
- `services/memory/notify.py` ✅ universal fan-out with local fallback.
- **`services/knowledge-mcp/knowledge_system/mcp_server.py`** ❌ **no logging setup** — uses bare `print()` / silent fail. Zero `logger` calls (verified `grep -rn "logger\|logging\.\|getLogger"` = 0 matches).
- `services/orchestration/` ❌ not audited (likely same gap).
- `services/voice-server/` ❌ not audited.
- 22 log files exist in `services/*/logs/` (mem0-server.log, batch-embed-*.log, mcp-*.log, etc.) but no MCP-server log file — the knowledge MCP server's only observability is launchd's stdout.

### Crons

- 10+ launchd plists under `~/Library/LaunchAgents/com.memroos.*.plist` (batch-embed, chatgpt-mcp, circleback-sync, discord-message-memory, graph-catchup, meet-sync.*).
- Each redirects `StandardOutPath`/`StandardErrorPath` to a `*.log` and `*-error.log` — **manual rotation**, no size cap, no retention policy. This is the source of the recurring disk-full incidents (see note: `memroos-persist-failure-rca-2026-07-05`).

### Operator NOC

- `/api/health/route.ts` exists but does not surface per-service log health (last-write time, size, rotation status).
- Existing NOC notes (`operations-noc-real-data-requirements.md`) call out fake panel values but not log-freshness panels.

## Findings (root-cause shaped)

| # | Finding | Severity |
|---|---|---|
| F1 | Next.js app has no structured logger; every error path is unsearchable stdout. | High |
| F2 | `agent-context-bus.ts` is silent — operator cannot see agent-to-agent traffic at all. | High |
| F3 | `services/knowledge-mcp/mcp_server.py` has zero logging — knowledge write/read/audit events disappear. | High |
| F4 | Cron launchd logs have no size cap or rotation → guaranteed disk pressure every ~3 months. | Medium |
| F5 | No correlation ID flows from request → memory → MCP → knowledge write. Tracing a single operator action across services is impossible. | High |
| F6 | NOC dashboard does not surface log health (last-write, size, error rate) per service. | Medium |
| F7 | `mem0-server.log` dual-logger multiplication (Python `logging` + uvicorn access both write the same line) — verified 2026-07-06 RCA in `memroos-operations`. | Low (already known) |

## Suggested Approach

Three-line ladder:

1. **Foundation first** (F1, F5): add `apps/memroos/src/lib/logger.ts` (pino → stdout JSON). Migrate the 5 hottest `console.*` files. Add request-id middleware (`x-request-id` propagation).
2. **Service gap closure** (F2, F3): wire `logging` into `mcp_server.py` + add MCP log file to launchd. Add bus-level tracing to `agent-context-bus.ts`.
3. **Operate** (F4, F6): rotate cron launchd logs via `newsyslog` or `logrotate` with 100MB × 3. Add `/api/health/logs` endpoint → NOC panel.

**Out of scope:** replacing `notify.py`, replacing `RotatingFileHandler`, building a log search UI, sending logs off-box.

## Paste-Ready GSD Requirements (LOG-01..12)

- [ ] **LOG-01**: A single `lib/logger.ts` exports one structured logger (pino, JSON to stdout) with `child({requestId, agentId, ...})` API; no module may call `console.*` outside `lib/logger.ts` itself (CI grep gate).
- [ ] **LOG-02**: Every `/api/**` route handler receives `x-request-id` (generated if absent) attached to the request context; the same id is logged at entry, exit, and error, and propagated to downstream service calls (memory, MCP, knowledge).
- [ ] **LOG-03**: The 5 highest-volume `console.*` files (`memory-consolidation`, `memory/graph-catchup`, `memory-decay`, `embeddings/embedding-job`, `seal/audit`) are migrated to the structured logger and verified by a CI grep gate.
- [ ] **LOG-04**: `lib/agent-context-bus.ts` logs every send/reply/fail with `agentId`, `messageId`, `correlationId`, `direction` at INFO; failures at ERROR with full payload.
- [ ] **LOG-05**: `services/knowledge-mcp/knowledge_system/mcp_server.py` adds stdlib `logging` configured identically to `mem0-server.py` (rotating file + stdout tee, 50MB × 5); the launchd plist `com.memroos.chatgpt-mcp.plist` is updated to redirect to `logs/mcp-knowledge-server.log` and `logs/mcp-knowledge-error.log`.
- [ ] **LOG-06**: Every MCP tool handler logs `tool`, `agent_id`, `workspace`, `latency_ms`, `status`, `error_type` (if any) at the entry/exit boundary — no payload contents at INFO; redaction path is `logging.Filter` that strips obvious PII fields.
- [ ] **LOG-07**: All MemroOS `~/Library/LaunchAgents/com.memroos.*.plist` files use a size-bounded rotation scheme (`newsyslog` or in-process `RotatingFileHandler`) with a 100MB × 3 cap; verified by a launchd config audit script that fails if any plist redirects to an unrotated log path.
- [ ] **LOG-08**: A new `/api/health/logs` endpoint returns per-service `{service, logPath, lastWriteAt, sizeBytes, rotationStatus, recentErrorCount}` by reading the rotating file handlers' `tail`/`stat`.
- [ ] **LOG-09**: NOC `Operations` panel adds a "Service Logs" sub-panel showing LOG-08 data with honest empty/degraded states when a log file is missing or stale (>24h without write); no fabricated metrics.
- [ ] **LOG-10**: Verification: CI grep proves zero `console.log|warn|error|info|debug` calls outside `lib/logger.ts` (excluding tests, scripts, and `instrumentation.ts`); CI fails if the gate regresses.
- [ ] **LOG-11**: Dual-logger fix in `mem0-server.py` — disable uvicorn's access log on the same handler as Python `logging` (so each event writes once, not twice). Refer to the 2026-07-06 RCA; carry forward the fix as part of LOG-01's verification.
- [ ] **LOG-12**: Operator NOC log-freshness card surfaces when a service hasn't logged in >24h (warning) or >72h (alarm); click-through opens the rotating log tail viewer (read-only, last 200 lines).

## Suggested Phase Boundary

One milestone, three phases (cohesive — split only when scope balloons):

- **Phase 172 — Logger foundation + Next.js migration** (LOG-01, LOG-02, LOG-03, LOG-10, LOG-11): pino + request-id + CI grep gate + the 5 hot-file migrations + mem0 dual-logger fix.
- **Phase 173 — Service + MCP + agent bus observability** (LOG-04, LOG-05, LOG-06): mcp_server.py logging, MCP tool-call boundary logs, agent-context-bus tracing.
- **Phase 174 — Cron rotation + NOC log health panel** (LOG-07, LOG-08, LOG-09, LOG-12): launchd rotation, `/api/health/logs`, NOC surface, freshness alarms.

**Out of scope:** off-box log shipping, ELK/Loki, replacing `notify.py`, log-search UI, PII redaction beyond a basic filter.

## Open Questions for Luis

1. **Scope** — keep three phases, fold LOG-01..03 into v8.13, or only do Phase 172 (logger + Next.js) first?
2. **Logger lib** — pino (already battle-tested in Next.js land, JSON-native) vs hand-rolled `console.*` wrapper. Ponytail default: pino, 1 dep, zero config. Approval needed?
3. **Cron rotation** — `newsyslog` (macOS native, no install) vs in-process `RotatingFileHandler` rewrite of every launchd job. Ponytail default: `newsyslog` for the 10 launchd jobs we don't own, `RotatingFileHandler` for the 2 we do (mem0, mcp-knowledge). Confirm?
