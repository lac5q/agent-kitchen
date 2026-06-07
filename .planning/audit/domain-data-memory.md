# Domain C — Data & Memory Handling Audit (AUDIT-03)

**Phase:** 109 — Parallel Domain Audit (Plan 109-04, Wave 2)
**Generated:** 2026-06-07
**Scope:** Python services (knowledge-mcp, memory, orchestration, voice-server) — unsafe deserialization, data leakage, privacy-in-logs, memory access controls, service trust boundaries.
**Methodology rule (RESEARCH.md Pitfall 2):** trust boundaries documented BEFORE severity is assigned to any "missing service auth" finding.

---

## Trust Boundaries

Determined from `docker-compose.yml`, `scripts/memroos-mcp.sh`, `scripts/install-chatgpt-mcp-launchd.sh`, and per-service `uvicorn.run(...)` / FastMCP host defaults. **Critical structural fact:** the four Python services are NOT in `docker-compose.yml` (only the `memroos` Next.js app is containerized). The Python services run as native host processes; the app reaches `memory` over `MEM0_URL` (default `http://localhost:3201`, `http://host.docker.internal:3201` from the container).

| Service | Default Bind | Boundary | Auth at service level | Evidence |
|---------|-------------|----------|----------------------|----------|
| knowledge-mcp (MCP server) | `127.0.0.1:8765` (default); `0.0.0.0` only when operator opts into Tailscale | **public-reachable (opt-in)** | Bearer token (opt-in, off by default) | `mcp_server.py:108` host default `127.0.0.1`; `scripts/memroos-mcp.sh:89` / `install-chatgpt-mcp-launchd.sh:9` document `0.0.0.0` for Tailscale; bearer at `mcp_server.py:118-126` |
| memory / mem0-server | `0.0.0.0:3201` (documented run cmd) | **loopback-intended, binds-broadly** | None | `mem0-server.py:3` `uvicorn mem0-server:app --host 0.0.0.0 --port 3201`; reached via `MEM0_URL` localhost (`constants.ts:49`); no `add_middleware`/auth in file |
| memory / local-embed-server | `0.0.0.0:8002` | **loopback-intended, binds-broadly** | None | `local-embed-server.py:78` `uvicorn.run(app, host="0.0.0.0", ...)`; bandit B104 |
| orchestration | internal (TS proxy fronts it) | **loopback / docker-internal** | None at Python level — by design | `app.py:118-120` "The Python service port is internal; the TS proxy adds authorizeRegistryWrite"; `x-operator-id` header is identity-only, unverified (`app.py:109,144`) |
| voice-server | `0.0.0.0` health/server | **loopback-intended, binds-broadly** | None | `health.py:45`, `server.py:73` bandit B104 |

**Boundary interpretation:** memory, embed, and voice-server services intentionally rely on network isolation (loopback / host firewall) rather than service-level auth. This is the documented architecture (orchestration `app.py:118-120` makes it explicit). The risk is therefore *defense-in-depth* (binding `0.0.0.0` instead of `127.0.0.1` widens exposure if the host is on an untrusted LAN/Tailnet), not standalone auth bypass. Severities below reflect this.

---

## Top Findings (severity-ranked)

| ID | Severity | Title | Location | Fix Req |
|----|----------|-------|----------|---------|
| C01-001 | high | mem0ai 0.1.118 — 4 known CVEs (core memory service) | services/memory/requirements.txt:6 | SEC-04 |
| C01-002 | medium | mem0/embed/voice FastAPI bind `0.0.0.0` with no service auth | mem0-server.py:3, local-embed-server.py:78, voice-server health.py:45/server.py:73 | SEC-03 |
| C01-003 | medium | diskcache 5.6.3 CVE-2025-69872 (no fix version) | services/knowledge-mcp/requirements.txt | SEC-04 |
| C01-004 | low | orchestration: fastapi/uvicorn unpinned in requirements | services/orchestration/requirements.txt:1-2 | SEC-04 |
| C01-005 | low | voice-server predictable temp file `/tmp/voice-session-state.json` | voice-server/health.py:21, server.py:32 | SEC-03 |
| C01-006 | low | voice-server pip-audit NOT performed (pipecat-ai conflict) — CVE blind spot | services/voice-server/requirements.txt | SEC-04 |

No `critical` findings. No unauthenticated-RCE path identified.

---

## Full Findings

### C01-001 — mem0ai 0.1.118 carries 4 CVEs (core memory dependency)
- **Domain:** C (Data/Memory)
- **Severity:** high
- **Location:** `services/memory/requirements.txt:6` (`mem0ai>=0.1,<1.0`; installed 0.1.118; PyPI latest 2.0.2)
- **Evidence (pip-audit, toolchain-baseline.md):** CVE-2026-31240 (no fix), CVE-2026-7597 (fix 2.0.0b2), CVE-2026-31245 (no fix), CVE-2026-31241 (no fix). mem0ai is the backing library for the `memory` service — the most security-sensitive Python dependency in the stack (it mediates all agent vector memory via Qdrant).
- **Impact:** Known vulnerabilities in a directly-invoked core dependency. Three have no fix version; the one fixable CVE (CVE-2026-7597) requires a major-version jump to 2.0.0b2 (a pre-release), which is a breaking upgrade. Exploitability depends on the specific CVE classes (not enumerated in the advisory feed available here) — rated `high` per the rubric (CVE in a directly-invoked dependency) rather than `critical` because no working unauthenticated-RCE exploit is confirmed and the service sits behind a loopback-intended boundary.
- **Remediation:** Track the 2.0.x migration as a dedicated upgrade spike (breaking API changes expected — mem0ai 0.1→2.0 changed the `Memory` interface). In the interim, confirm the `memory` service is not reachable off-host (see C01-002). Re-run `pip-audit` at Phase 110 start to pick up any newly published fix versions.
- **Mapped Fix Requirement:** SEC-04
- **Confidence:** verified (pip-audit, Wave 1 baseline)

### C01-002 — memory/embed/voice FastAPI services bind 0.0.0.0 with no service-level auth
- **Domain:** C (Data/Memory)
- **Severity:** medium
- **Location:** `services/memory/mem0-server.py:3` (documented `--host 0.0.0.0`); `services/memory/local-embed-server.py:78` (`uvicorn.run(app, host="0.0.0.0", ...)`); `services/voice-server/health.py:45`, `services/voice-server/server.py:73` (bandit B104)
- **Evidence:** No `add_middleware`/CORS/bearer guard in `mem0-server.py` or `local-embed-server.py`. `mem0-server` exposes `/memory/add`, `/memory/search`, `/memory/all`, `/memory/reset`, `DELETE /memory/{id}` — full read/write/delete of agent memory. bandit B104 "binding to all interfaces" at the listed lines.
- **Trust-boundary justification (required):** Per the documented architecture (`orchestration/app.py:118-120`), Python services rely on network isolation, not service auth — the TS proxy (`authorizeRegistryWrite`) and host firewall are the intended control. The finding is therefore a **defense-in-depth gap**, not a standalone auth bypass: binding `0.0.0.0` instead of `127.0.0.1` means any host that can route to the machine (untrusted LAN, Tailnet, misconfigured firewall) reaches an unauthenticated memory read/write/delete API. On a correctly firewalled single-host deployment the exposure is nil; on a shared/Tailnet host it is reachable. Rated `medium` (defense-in-depth gap that increases attack surface; requires a network-position precondition).
- **Remediation:** Default-bind to `127.0.0.1` and require an explicit opt-in env var (mirroring the knowledge-mcp `MEMROOS_MCP_HOST` pattern) before binding `0.0.0.0`. If off-host access is required, add a shared-secret bearer guard consistent with knowledge-mcp's `secrets.compare_digest` pattern.
- **Mapped Fix Requirement:** SEC-03
- **Confidence:** verified (bandit B104 + manual confirmation of absent auth middleware)

### C01-003 — diskcache 5.6.3 CVE-2025-69872 in knowledge-mcp
- **Domain:** C (Data/Memory)
- **Severity:** medium
- **Location:** `services/knowledge-mcp/requirements.txt` (diskcache 5.6.3, transitive)
- **Evidence:** pip-audit (Wave 1 baseline) flagged CVE-2025-69872 with no fix version listed. Grep for direct usage (`diskcache|Cache(|FanoutCache`) in `services/knowledge-mcp/**/*.py` returned **no matches** — diskcache is a transitive dependency not directly invoked by first-party code.
- **Impact:** A CVE with no fix version available. Because no first-party code path constructs a diskcache `Cache`, the attack surface is limited to whatever upstream dependency pulls it in. Lower exploitability than a directly-invoked dependency; rated `medium` per the CVE-in-dependency rubric tempered by the absent direct-usage evidence.
- **Remediation:** Identify the parent dependency (`pip show diskcache` / dependency tree) and track upstream for a fixed diskcache release; pin a patched version when published. No code change required now.
- **Mapped Fix Requirement:** SEC-04
- **Confidence:** verified (pip-audit) — usage analysis: likely (grep-confirmed no direct calls)

### C01-004 — orchestration requirements pin nothing for fastapi/uvicorn
- **Domain:** C (Data/Memory)
- **Severity:** low
- **Location:** `services/orchestration/requirements.txt:1-2` (`fastapi`, `uvicorn[standard]` — no version constraints)
- **Evidence:** Unpinned top-level web-framework deps. pip-audit reported 0 CVEs *at scan time*, but an unpinned install resolves to whatever is latest on each rebuild — a supply-chain/reproducibility gap (a future malicious or regressed release would be pulled silently).
- **Impact:** No current CVE; hygiene/reproducibility gap. Builds are non-deterministic and a future bad release enters without review.
- **Remediation:** Pin to compatible ranges consistent with the `memory` service (`fastapi>=0.115,<1.0`, `uvicorn[standard]>=0.32,<1.0`).
- **Mapped Fix Requirement:** SEC-04
- **Confidence:** verified (file inspection)

### C01-005 — voice-server uses predictable shared temp file
- **Domain:** C (Data/Memory)
- **Severity:** low
- **Location:** `services/voice-server/health.py:21`, `services/voice-server/server.py:32` (`SESSION_STATE_FILE = "/tmp/voice-session-state.json"`)
- **Evidence:** bandit B108 "probable insecure usage of temp file/directory." Fixed predictable path in world-writable `/tmp`.
- **Impact:** On a multi-user host, a local attacker could pre-create / symlink the path (TOCTOU) to corrupt or redirect session-state writes. No remote vector; requires local shell. Single-user host (the documented deployment model) → negligible.
- **Remediation:** Use `tempfile.gettempdir()` joined with a process/user-scoped name, or place under a `0700` app-owned data dir, and open with `O_CREAT|O_EXCL`.
- **Mapped Fix Requirement:** SEC-03
- **Confidence:** verified (bandit B108)

### C01-006 — voice-server Python deps not CVE-scanned (pip-audit blind spot)
- **Domain:** C (Data/Memory)
- **Severity:** low (informational coverage gap)
- **Location:** `services/voice-server/requirements.txt`
- **Evidence:** Wave 1 pip-audit FAILED on voice-server — pip-audit's isolated venv could not resolve conflicting `pipecat-ai<2.0` constraints (toolchain-baseline.md, 109-01-SUMMARY.md deviation #1). The file was not scanned; CVE status is **unknown**.
- **Impact:** voice-server dependency CVEs are an unmeasured blind spot. Not a vulnerability per se — an attestation gap that must be closed before Phase 110 can claim full Python CVE coverage.
- **Remediation:** Resolve the pipecat-ai constraint conflict (pin a single compatible pipecat-ai version) then re-run `pip-audit -r services/voice-server/requirements.txt`; or scan the installed environment with `pip-audit --environment` against the live venv to bypass the resolver conflict.
- **Mapped Fix Requirement:** SEC-04
- **Confidence:** verified (scan-failure reproduced in baseline)

---

## Coverage Attestation

One row per Domain C manual checklist item. Status ∈ {CLEAN, FINDING, N-A, NOT-CHECKED}.

| Checklist Item | Status |
|----------------|--------|
| knowledge-mcp bearer token (constant-time, non-empty check, env-gated) | CLEAN — `mcp_server.py:118-126`: `secrets.compare_digest`; returns `None` (auth disabled) only when token is empty/unset; host defaults to `127.0.0.1`; transport defaults to `stdio`. Correct constant-time comparison; opt-in by design. |
| memory + orchestration FastAPI service-level auth vs trust boundary | FINDING: C01-002 (memory binds 0.0.0.0, no auth — defense-in-depth gap). Orchestration: CLEAN — documented loopback/proxy-fronted boundary (`app.py:118-120`); `x-operator-id` is identity-only by design, no severity assigned (boundary documented). |
| voice-server meeting tokens never logged (no room_url / join-token logging) | CLEAN — `meeting_bot.py:11,49-54`: D-13 mitigation, logs `session_id` only; full grep of voice-server `logger.*`/`print(` found no `token`/`room_url` interpolation (`pipeline_cascade.py:56` logs only that GROQ_API_KEY is unset, not its value). |
| Unsafe YAML / pickle / marshal / shelve deserialization across services | CLEAN — grep for `pickle\|yaml.load\|marshal\|shelve` returned no matches; both yaml call sites use `yaml.safe_load` (`mem0-server.py:81`, `mcp_server.py:208`). No RCE-class deserialization. |
| Data-leakage redaction (memory responses filtered by policy-gate labels) | CLEAN — `policy-gate.ts` (`filterAuthorizedMemoryItems`) is wired into every TS memory read path: `api/memory/search`, `api/memory/multi-search`, `api/recall`, `api/dispatch`, `backends.ts`, `chatgpt-actions.ts`. Phase 74-78 retrieval gate not regressed. |
| File-path traversal (user-supplied paths in file operations) | CLEAN — `check_sqlite_db()` (`mem0-server.py:281`) called with no args (hardcoded default `~/.mem0/history.db`, `:570`); no user-supplied path flows into `sqlite3.connect`/`open` in the scanned services. |
| SQLite DB paths are hardcoded constants, not user-supplied | CLEAN — all DB paths are module constants or env-var-with-static-default: `mem0_queue.py:15`, `mem0-server.py:65`, `orchestration/app.py:20` (`ORCHESTRATION_DB_PATH` default `data/orchestration.db`), `voice-server` `SQLITE_DB_PATH` default `data/conversations.db`. No request-derived path construction. |
| ChromaDB / qdrant-client CVEs at installed versions | CLEAN — pip-audit (Wave 1) reported 0 CVEs for chromadb (`>=0.5,<1.0`) and qdrant-client (`>=1.12,<2.0`) in `services/memory`; only mem0ai (C01-001) flagged in that service. |
| mem0ai 0.1.x vs 2.0.2 version-lag security implications | FINDING: C01-001 (4 CVEs; 1 fixable only via breaking 2.0.0b2 upgrade). |
| no-direct-Qdrant-write constraint (mem0 writes via POST localhost:3201 only) | CLEAN — grep for direct `QdrantClient`/`.upsert`/`/collections/.../points` writes from `apps/memroos/src/**/*.ts` returned no matches; all TS memory writes go through `fetch(`${MEM0_URL}/memory/add`)` (`chatgpt-actions.ts:369`, `memory-recall-evals.ts:486`). `MEM0_URL` default `http://localhost:3201` (`constants.ts:49`). No local Qdrant in `docker-compose.yml`. Constraint upheld. |

**Supplementary attestations (tooling):**

| Item | Status |
|------|--------|
| pip-audit — knowledge-mcp | DONE — 1 CVE (diskcache, C01-003) |
| pip-audit — memory | DONE — 4 CVEs (mem0ai, C01-001) |
| pip-audit — orchestration | DONE — 0 CVEs (deps unpinned, C01-004) |
| pip-audit — voice-server | NOT-CHECKED — pipecat-ai resolver conflict (C01-006) |
| bandit `-r services/` | DONE — `/tmp/bandit-domain-c.json` (349 results: 342 LOW, 7 MEDIUM); MEDIUM = B104 bind-all (C01-002) ×5, B108 temp-file (C01-005) ×2 |

---

## Summary Stats

| Metric | Value |
|--------|-------|
| Findings total | 6 |
| critical | 0 |
| high | 1 (C01-001 mem0ai CVEs) |
| medium | 2 (C01-002 bind-0.0.0.0, C01-003 diskcache) |
| low | 3 (C01-004 unpinned, C01-005 temp-file, C01-006 voice scan gap) |
| Findings → SEC-04 (dependency/coverage) | 4 (C01-001, C01-003, C01-004, C01-006) |
| Findings → SEC-03 (medium/defense-in-depth) | 2 (C01-002, C01-005) |
| Unsafe deserialization (pickle/yaml.load) | 0 — both yaml sites use safe_load |
| Services pip-audited | 3 of 4 (voice-server blocked) |
| bandit MEDIUM (non-test) | 5 (3 mem0/embed + 2 voice-server) |
| Trust boundaries documented | 5 service surfaces (knowledge-mcp, mem0-server, embed, orchestration, voice-server) |

**Prior-baseline note:** Phase 74-78 memory-security work (classification cascade, retrieval authorization gate, safe index projections, envelope encryption, security-regression tests) was verified present/not-regressed — `policy-gate.ts` filtering remains wired into all read paths. No closed findings re-filed.

**Handoff to Wave 3:** all 6 findings use the `C01-NNN` schema for aggregation into `.planning/audit/FINDINGS-INDEX.md`. CVE findings route to SEC-04 regardless of severity label; C01-002/C01-005 route by severity to SEC-03.
