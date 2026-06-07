---
phase: 109-parallel-domain-audit
plan: 06
generated: 2026-06-07
domains: [A-Auth-Secrets, B-API-Surface, C-Data-Memory, D-Architecture]
consumer: "Phase 110 (SEC-01/02/05), Phase 111 (SEC-03/04/06), Phase 112 (ARCH-01..05)"
---

## Headline

The Phase 109 audit found **0 critical, 2 high, 7 medium, 12 low, and 3 informational** findings across all four security domains. The two high-severity findings are: **B01-001** — Next.js v16.2.4 ships 13 known CVEs including middleware/proxy-bypass variants (GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f) that directly threaten the app's centralized auth model in `proxy.ts`, and **C01-001** — the core memory dependency `mem0ai 0.1.118` carries 4 known CVEs with no upgrade path short of a breaking major-version jump to 2.0.x. No unauthenticated remote code execution path was identified. Auth, cookie security, SQL parameterization, memory access controls, and service trust boundaries are in good shape; the primary remediation work queue is dependency upgrades (SEC-04), medium hardening items (SEC-03), and architecture cleanup (ARCH-01..05).

---

## Master Findings Table

| Finding ID | Domain | Title | Severity | Location | Fix Requirement |
|------------|--------|-------|----------|----------|-----------------|
| B01-001 | B — API Surface | Next.js v16.2.4 middleware/proxy-bypass CVEs apply (auth lives in middleware) | high | apps/memroos/package.json (next ^16.2.4); proxy.ts | SEC-04 |
| C01-001 | C — Data/Memory | mem0ai 0.1.118 — 4 known CVEs (core memory service) | high | services/memory/requirements.txt:6 | SEC-04 |
| A01-001 | A — Auth/Secrets | JWT secret has no minimum-entropy enforcement at load | medium | apps/memroos/src/lib/auth/jwt.ts:6-11 | SEC-03 |
| B01-002 | B — API Surface | CSP `unsafe-eval` set unconditionally in script-src (not required in prod) | medium | apps/memroos/src/proxy.ts:101 | SEC-03 |
| B01-004 | B — API Surface | No input-validation framework (zod absent); route bodies validated ad-hoc | medium | apps/memroos/src/app/api/** (multiple) | SEC-03 |
| B01-005 | B — API Surface | No rate limiting on non-auth endpoints | medium | apps/memroos/src/app/api/** (multiple) | SEC-03 |
| C01-002 | C — Data/Memory | mem0/embed/voice FastAPI bind `0.0.0.0` with no service auth | medium | services/memory/mem0-server.py:3; local-embed-server.py:78; voice-server/health.py:45; server.py:73 | SEC-03 |
| C01-003 | C — Data/Memory | diskcache 5.6.3 CVE-2025-69872 (no fix version) | medium | services/knowledge-mcp/requirements.txt | SEC-04 |
| D01-001 | D — Architecture | 129 API routes; only 29 (22%) use canonical `{ ok: false, error }` error shape | medium | apps/memroos/src/app/api/**/route.ts | ARCH-04 |
| A01-002 | A — Auth/Secrets | Known default internal API key shipped in `.env.example` and used as dev fallback | low | .env.example:18 / apps/memroos/src/lib/db-schema.ts:795 | SEC-05 |
| A01-003 | A — Auth/Secrets | Cookie `SameSite=Lax` (not `Strict`) on session cookies | low | apps/memroos/src/app/api/auth/login/route.ts:87-89 | none — informational |
| A01-004 | A — Auth/Secrets | semgrep dummy-bcrypt-hash hit — false positive (timing-defense constant) | low | apps/memroos/src/app/api/auth/login/route.ts:52 | none — informational |
| B01-003 | B — API Surface | `chatgpt/actions/openapi` reflects untrusted `x-forwarded-host` into spec base URL | low | apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts:6-13 | SEC-03 |
| C01-004 | C — Data/Memory | orchestration requirements pin nothing for fastapi/uvicorn | low | services/orchestration/requirements.txt:1-2 | SEC-04 |
| C01-005 | C — Data/Memory | voice-server uses predictable shared temp file `/tmp/voice-session-state.json` | low | services/voice-server/health.py:21; server.py:32 | SEC-03 |
| C01-006 | C — Data/Memory | voice-server pip-audit NOT performed (pipecat-ai conflict) — CVE blind spot | low | services/voice-server/requirements.txt | SEC-04 |
| D01-002 | D — Architecture | Runtime circular import in memory subsystem (backends.ts <-> registry.ts <-> adapter.ts) | low | apps/memroos/src/lib/memory/backends.ts:4 <-> registry.ts:9 <-> adapter.ts:10 | ARCH-02 |
| D01-003 | D — Architecture | 12 unsafe TypeScript casts (none in auth/JWT/crypto paths) | low | apps/memroos/src/app/api/agents/**; components/voice/VoicePanel.tsx:354,373,375 | ARCH-05 |
| D01-004 | D — Architecture | Type-only circular import in seal (types.ts <-> proposal-registry.ts) | low | apps/memroos/src/lib/seal/types.ts:2 <-> proposal-registry.ts:1 | ARCH-02 |
| D01-005 | D — Architecture | Dead exports in security-sensitive paths (auth/seal/policy-gate/classification) | low | apps/memroos/src/lib/auth/jwt.ts:50; lib/seal/**; lib/memory/policy-gate.ts:6; lib/classification/types.ts:34 | ARCH-01 |
| D01-009 | D — Architecture | Shell-mode execFileSync with interpolated tool name (config-controlled, not request-reachable) | low | apps/memroos/src/lib/context-sources.ts:119 | ARCH-02 |
| D01-006 | D — Architecture | Repo-wide dead code: 11 unused files, 120 unused exports, 125 unused types | info | apps/memroos/src/ (knip — 11 files, 120 exports, 125 types) | ARCH-01 |
| D01-007 | D — Architecture | Python dead code — ~30 vulture flags (majority decorator false positives) | info | services/knowledge-mcp/**/*.py; services/memory/**/*.py | ARCH-01 |
| D01-008 | D — Architecture | Python lint — 50 ruff errors (29 auto-fixable, dominated by unused imports in tests) | info | services/voice-server/tests/*.py and others | ARCH-01 |

**Total rows: 24**

---

## Coverage Cross-Check

| Domain | Report | Finding count in report | Finding IDs in index | Match |
|--------|--------|------------------------|----------------------|-------|
| A — Auth/Secrets | domain-auth-secrets.md | 4 (A01-001..004) | A01-001, A01-002, A01-003, A01-004 | MATCH |
| B — API Surface | domain-api-surface.md | 5 (B01-001..005) | B01-001, B01-002, B01-003, B01-004, B01-005 | MATCH |
| C — Data/Memory | domain-data-memory.md | 6 (C01-001..006) | C01-001, C01-002, C01-003, C01-004, C01-005, C01-006 | MATCH |
| D — Architecture | domain-architecture.md | 9 (D01-001..009) | D01-001, D01-002, D01-003, D01-004, D01-005, D01-006, D01-007, D01-008, D01-009 | MATCH |
| **Total** | | **24** | **24** | **MATCH** |

Index row count (24) equals summed per-domain finding count (4 + 5 + 6 + 9 = 24). No findings dropped during aggregation.

Spot-check prefix coverage: `A01-` (4 rows present), `B01-` (5 rows present), `C01-` (6 rows present), `D01-` (9 rows present) — all domains accounted for.

---

## Severity Summary

### Overall Totals

| Severity | Count |
|----------|-------|
| critical | 0 |
| high | 2 |
| medium | 7 |
| low | 12 |
| info | 3 |
| **Total** | **24** |

### Per-Domain Breakdown

| Domain | critical | high | medium | low | info | Total |
|--------|----------|------|--------|-----|------|-------|
| A — Auth/Secrets | 0 | 0 | 1 | 3 | 0 | 4 |
| B — API Surface | 0 | 1 | 3 | 1 | 0 | 5 |
| C — Data/Memory | 0 | 1 | 2 | 3 | 0 | 6 |
| D — Architecture | 0 | 0 | 1 | 5 | 3 | 9 |
| **Total** | **0** | **2** | **7** | **12** | **3** | **24** |

---

## Fix-Requirement Routing Summary

Phase 110/111/112 planners: use this table to size work queues. Filter the Master Findings Table above by Fix Requirement to get the exact finding list for each bucket.

| Fix Req | Phase | Description | Count | Finding IDs |
|---------|-------|-------------|-------|-------------|
| SEC-01 | 110 | Critical security findings | 0 | — |
| SEC-02 | 110 | High security findings (non-CVE, non-secret) | 0 | — |
| SEC-03 | 111 | Medium/low security hardening | 7 | A01-001, B01-002, B01-003, B01-004, B01-005, C01-002, C01-005 |
| SEC-04 | 111 | CVE dependency findings | 5 | B01-001, C01-001, C01-003, C01-004, C01-006 |
| SEC-05 | 110 | Hardcoded/default secrets or credentials | 1 | A01-002 |
| SEC-06 | 111 | CI gate hardening | 0 | — |
| ARCH-01 | 112 | Dead code cleanup | 4 | D01-005, D01-006, D01-007, D01-008 |
| ARCH-02 | 112 | Circular dep / cross-layer / exec arg safety | 3 | D01-002, D01-004, D01-009 |
| ARCH-03 | 112 | Redundant patterns | 0 | — |
| ARCH-04 | 112 | Inconsistent error handling | 1 | D01-001 |
| ARCH-05 | 112 | Unsafe TypeScript casts | 1 | D01-003 |
| none — informational | — | No action required | 2 | A01-003, A01-004 |
| **Grand total** | | | **24** | |

**Routing notes:**

- **SEC-01 / SEC-02 empty:** No critical or high findings outside the CVE/dependency bucket. Both high findings (B01-001, C01-001) route to SEC-04 because they are dependency CVEs — per the type-based routing rule in RESEARCH.md.
- **SEC-06 empty:** No CI gate bypass or `secret-guard.yml` weakness found. TruffleHog CI integration is present and correctly configured.
- **ARCH-03 empty:** Domain D found no redundant patterns / duplicate auth-check or DB-connection implementations (AC-5: CLEAN, AC-6: CLEAN).
- **Informational findings (A01-003, A01-004):** `SameSite=Lax` is intentional and documented; the semgrep bcrypt hit is a verified false positive. No downstream fix required.
- **SEC-03 includes B01-003 (low):** B01-003 (`x-forwarded-host` reflection, low severity) is explicitly routed SEC-03 per the domain-api-surface.md report (optional hardening). Routing carried verbatim from domain report.
