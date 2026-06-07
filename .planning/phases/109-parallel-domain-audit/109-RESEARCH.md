# Phase 109: Parallel Domain Audit - Research

**Researched:** 2026-06-07
**Domain:** Security audit methodology + codebase-specific hotspot discovery
**Confidence:** HIGH (codebase explored directly; tool availability verified)

---

## Summary

Phase 109 runs 4 simultaneous audit agents across the memroos codebase (647 TypeScript/TSX + 39 Python source files, 129 Next.js API routes, 4 Python services) to produce ranked findings reports that phases 110–112 consume directly as work queues. The audit is the gate before any remediation — its output quality determines how precise the fix phases can be.

The codebase has a mature security posture for a product of its age: HttpOnly JWT cookies, a proxy-layer RBAC enforcement with CSP/security headers, a content scanner, Iris preflight injection detection, a secret-guard CI workflow, and a retrieval authorization gate. However, a Next.js version with 13 known CVEs is installed (v16.2.4, `npm audit` reports 1 high), `pip-audit` is not installed, `semgrep` is available but not wired into CI, and ~90 API routes handle auth via centralized proxy enforcement that has never been audited for gap/bypass. The security team needs verified coverage — not an assumption that the proxy catches everything.

The most important architectural fact for planning: **auth enforcement is centralized in `proxy.ts` (middleware), not per-route**. This means the AUDIT-02 domain must explicitly verify that the proxy matcher `config.matcher` has no blind spots and that routes intended to be public are explicitly accounted for — it is not meaningful to grep route files for auth keywords and infer exposure from that count alone.

**Primary recommendation:** Structure each agent as a document-producing Opus 4 run with a fixed checklist (per domain coverage matrix below) and a uniform findings schema. The planner should serialize 4 parallel task blocks and converge on a consolidated index that maps each finding to its fix-phase requirement (SEC-xx or ARCH-xx).

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md and STATE.md are authoritative. Audit agents MUST respect them AND the audit SHOULD verify the codebase complies with them.

| Directive | Source | Audit relevance |
|-----------|--------|-----------------|
| No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` | CLAUDE.md/STATE.md | AUDIT-02: verify no new exec/execSync in route handlers |
| `mem0` writes via `POST http://localhost:3201/memory/add` only — never touch `agent_memory` Qdrant directly | STATE.md | AUDIT-03: verify no direct Qdrant writes from TS code |
| Qdrant stays cloud — never add local Qdrant to Docker compose | STATE.md | AUDIT-03: verify no local Qdrant config |
| No `recursive readdir` on Obsidian vault | STATE.md | AUDIT-04: dead code/unsafe patterns |
| GitNexus: MUST run impact analysis before editing any symbol | CLAUDE.md | AUDIT-04 agents should use gitnexus_query/context for arch analysis |
| NEVER rename symbols with find-and-replace — use gitnexus_rename | CLAUDE.md | Out of scope for audit phase; applies to fix phases |
| This Next.js has breaking changes — read `node_modules/next/dist/docs/` before writing code | AGENTS.md | Applies to fix phases 110–112, not the audit |
| Production runs on port 3002 via `npm start` | STATE.md | Environment note for any dynamic test commands |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | Security team can verify Auth & secrets domain was audited — covering hardcoded secrets, token handling, JWT security, API key exposure, session management, and cookie flags | Domain A checklist section + hotspot signals below |
| AUDIT-02 | Security team can verify API surface was audited — covering missing auth guards, input validation gaps, injection risks (SQLi, XSS, SSTI), rate limiting, and CORS configuration | Domain B checklist section + proxy gap analysis guidance below |
| AUDIT-03 | Security team can verify Data & memory handling was audited — covering unsafe deserialization, data leakage paths, privacy exposure, unsafe file operations, and memory service access controls | Domain C checklist section + service layout findings below |
| AUDIT-04 | Engineering team can verify Architecture & code quality was audited — covering dead code, circular dependencies, leaky abstractions, redundant patterns, unsafe TypeScript casts, and inconsistent error handling | Domain D checklist section + toolchain guidance below |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JWT issuance / session cookies | API / Backend (Next.js route handlers) | Proxy (enforcement) | JWT minted in `/api/auth/login`, verified at proxy layer |
| RBAC enforcement | Frontend Server (Next.js proxy/middleware) | API routes (per-route checks) | `proxy.ts` enforceAuth owns role checks; route-local guards for special cases |
| Input validation | API / Backend (route handlers) | — | No validation framework (zod) detected; ad-hoc per route |
| Injection scanning (Iris) | API / Backend (pre-flight in dispatch) | Proxy (future) | `scanIrisPreflight` called in dispatch, not all routes |
| Secrets detection | CI/CD (secret-guard.yml) | Content scanner (runtime) | TruffleHog in CI; `content-scanner.ts` at runtime for agent output |
| Memory access control | API / Backend (policy-gate.ts) | — | `filterAuthorizedMemoryItems` called in dispatch/recall paths |
| Architecture dependency analysis | Codebase tooling | GitNexus graph | No automated madge/knip run exists — gap for AUDIT-04 |
| Dead code detection | Codebase tooling | Manual review | No ts-prune/knip configured — gap for AUDIT-04 |

---

## Domain Coverage Matrix

**Critical rule:** Each sub-requirement belongs to exactly one domain. Audit agents must not overlap on the seam items below.

| Requirement Sub-item | Assigned Domain | Seam Rule |
|----------------------|-----------------|-----------|
| Hardcoded secrets / tokens in source | AUDIT-01 | Secret values in code — not CI config |
| JWT signing key strength, algorithm, expiry | AUDIT-01 | Token mechanics; not route exposure |
| API key header handling, per-agent keys | AUDIT-01 | Key material handling |
| Cookie flags: HttpOnly, Secure, SameSite | AUDIT-01 | Cookie attributes only |
| Session management: refresh token rotation, revocation | AUDIT-01 | Session lifecycle |
| Missing auth guards (routes proxy may miss) | AUDIT-02 | Route exposure; not token quality |
| Input validation gaps across route handlers | AUDIT-02 | Request body/query validation |
| SQL injection risk (better-sqlite3 queries) | AUDIT-02 | Query construction |
| XSS vectors in API responses / CSP weaknesses | AUDIT-02 | Output encoding + CSP policy |
| SSTI / template injection | AUDIT-02 | Server-side template concerns |
| Rate limiting coverage (non-auth endpoints) | AUDIT-02 | Throttling surface |
| CORS configuration (if any) | AUDIT-02 | Origin policy |
| Unsafe deserialization (JSON.parse of untrusted input) | AUDIT-03 | Data handling |
| Data leakage paths (memory responses exposing sensitive data) | AUDIT-03 | Output sensitivity |
| Privacy exposure in logs / audit trails | AUDIT-03 | PII in persisted data |
| Unsafe file operations (path traversal, readdir) | AUDIT-03 | Filesystem access |
| Memory service access controls (mem0, Qdrant, SQLite) | AUDIT-03 | Data tier enforcement |
| Python service auth (knowledge-mcp bearer, memory service) | AUDIT-03 | Service-to-service auth |
| Dead code / unused exports | AUDIT-04 | Code quality |
| Circular dependencies | AUDIT-04 | Module boundaries |
| Leaky abstractions / cross-layer coupling | AUDIT-04 | Architecture |
| Redundant patterns / copy-paste duplication | AUDIT-04 | DRY violations |
| Unsafe TypeScript `as any` casts | AUDIT-04 | Type safety |
| Inconsistent error handling across routes | AUDIT-04 | Error boundary patterns |

---

## Findings Report Schema

Every finding from all 4 domain agents MUST use this identical schema. Uniformity enables phase-110/111/112 planners to filter by severity and domain.

```
Finding ID: {DOMAIN}-{NNN}   (e.g., A01-001, B01-042, C01-007, D01-015)
Domain: {A=Auth/Secrets | B=API Surface | C=Data/Memory | D=Architecture}
Title: one-line description
Severity: critical | high | medium | low
Location: file path : line number (or "multiple — see evidence")
Evidence: exact code snippet, query result, or tool output
Impact: what an attacker or engineer experiences if this is not fixed
Remediation: specific fix recommendation
Mapped Fix Requirement: {SEC-01..06 | ARCH-01..05 | "none — informational"}
Confidence: verified (tool + manual confirmation) | likely (single source) | possible (pattern only)
```

**Severity taxonomy (must match phases 110–112 filter keys):**
- `critical` → SEC-01 (fix immediately)
- `high` → SEC-02 (fix before client review)
- `medium` → SEC-03 (fix or accept-risk rationale required)
- `low` → informational; no mandatory fix requirement

**Domain prefixes:**
- Domain A (Auth/Secrets): `A01-NNN`
- Domain B (API Surface): `B01-NNN`
- Domain C (Data/Memory): `C01-NNN`
- Domain D (Architecture/Code Quality): `D01-NNN`

**Deliverable per domain:** One `{DOMAIN}-FINDINGS.md` file with a severity-ranked table at the top followed by full findings. Phase 109 also produces a `109-FINDINGS-INDEX.md` that concatenates all 4 into a single filterable table keyed by severity + mapped-fix-requirement.

---

## Standard Stack (Audit Toolchain)

### Automated Tools — Available Now

| Tool | Ecosystem | Purpose | Version | Notes |
|------|-----------|---------|---------|-------|
| semgrep | Python/TS | SAST — secrets, injection, security anti-patterns | 1.132.0 | `[VERIFIED: installed]` Installed at `/opt/homebrew`; NOT in CI |
| TruffleHog | Both | Secret scanning (already in secret-guard.yml CI) | in CI | `[VERIFIED: CI workflow]` `--only-verified` flag |
| npm audit | Node.js | Dependency CVE detection | Node 26.0.0 | `[VERIFIED: ran]` 1 high (next), 3 moderate |
| better-sqlite3 parameterized queries | TS | SQL injection prevention (review pattern, not a tool) | — | Use as a verification lens |

### Tools Requiring Install Before Execution

| Tool | Purpose | Install | Priority |
|------|---------|---------|----------|
| pip-audit | Python dep CVE detection | `pip install pip-audit` | HIGH — AUDIT-03 blocker |
| bandit | Python SAST | `pip install bandit` | HIGH — AUDIT-03 (Python services) |
| ruff | Python linting | `pip install ruff` | MEDIUM — AUDIT-04 Python |
| gitleaks | Git history secret scan | `brew install gitleaks` | MEDIUM — AUDIT-01 history check |
| madge | Circular dependency detection (TS) | `npm install -g madge` | HIGH — AUDIT-04 |
| knip | Dead code / unused exports (TS) | `npm install -g knip` | HIGH — AUDIT-04 |

### Manual Review (LLM Agent Work)

| Area | Why Automated Tools Miss It | Domain |
|------|-----------------------------|--------|
| Proxy matcher gap analysis | Logic-level analysis; not pattern-matchable | AUDIT-02 |
| Leaky abstractions | Architectural judgment required | AUDIT-04 |
| Inconsistent error handling | Pattern-level consistency across 129 routes | AUDIT-04 |
| Python service-to-service auth | Trust boundary reasoning | AUDIT-03 |
| Dead code that is imported but never called | knip covers most; agent covers cross-module judgment | AUDIT-04 |

---

## Package Legitimacy Audit

> This phase installs audit toolchain packages. No new production dependencies are added.

| Package | Registry | Notes | slopcheck | Disposition |
|---------|----------|-------|-----------|-------------|
| semgrep | PyPI | 10+ years, maintained by Semgrep Inc | `[ASSUMED]` | Approved — known tool |
| pip-audit | PyPI | Maintained by PyPA / Trail of Bits | `[ASSUMED]` | Approved — known tool |
| bandit | PyPI | PyCQA organization | `[ASSUMED]` | Approved — known tool |
| ruff | PyPI | Astral organization | `[ASSUMED]` | Approved — known tool |
| gitleaks | Homebrew | Maintained by zricethezav | `[ASSUMED]` | Approved — known tool |
| madge | npm | Long-standing TS/JS tool | `[ASSUMED]` | Approved — known tool |
| knip | npm | Modern TS dead-code tool | `[ASSUMED]` | Approved — known tool |

*slopcheck was not available in this environment; all packages are `[ASSUMED]`. The planner should add a `checkpoint:human-verify` step before each install, or confirm these are well-known tools (which they are at time of research).*

---

## Preliminary Scope Signals

> These are **hotspots to aim agents at** — not findings. The audit agents verify, refute, or confirm each signal during execution.

### Domain A — Auth/Secrets Hotspots

- **Cookie Secure flag is conditional on `isProd`** — set correctly for prod, but worth confirming the `isProd` detection logic is correct (env var check vs NODE_ENV). Found in `src/app/api/auth/login/route.ts:85` and `refresh/route.ts:82`.
- **Cookie SameSite=Lax (not Strict)** — Lax allows cross-site GET requests to carry cookies; verify this is intentional given the app has no SSR form submissions that would need it.
- **MEMROOS_JWT_SECRET** — must be in `.env.local` (not `.env`); prior UAT found this was missing. Verify secret strength requirements are documented.
- **API key auth via `x-memroos-operator-key` header or `Authorization: Bearer`** — `operator-auth.ts` accepts either. Check if the Bearer path is intended to remain or whether header-only tightens the surface.
- **Loopback bypass in `authorizeRegistryWrite`** — requests from localhost pass without a key. This is intentional for local dev; verify it cannot be reached from non-loopback contexts via spoofed headers. (The `x-forwarded-host` spoofing fix was already applied in `operator-auth.ts`.)
- **`mem0ai` version is `>=0.1,<1.0`** — this is 0.x; PyPI latest is 2.0.2 (per prior STATE.md spike notes). Not a secrets issue but a version gap worth noting for AUDIT-03 handoff.

### Domain B — API Surface Hotspots

- **129 total API routes; ~39 show in-route auth calls** — auth is centralized in `proxy.ts`. The real question is whether `config.matcher` (the Next.js middleware matcher) has blind spots. Current matcher: `"/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"`. This is broad and should catch all API routes, but the `ROUTE_LOCAL_AUTH_API_ROUTES` list in proxy.ts explicitly bypasses proxy-enforced JWT for agent-callable endpoints (dispatch, heartbeat, memory/add, skillforge, etc.) — these rely on route-local auth instead.
- **CSP carries `'unsafe-inline' 'unsafe-eval'` in script-src** — `proxy.ts:withSecurityHeaders` sets this. `unsafe-eval` is a significant XSS escalation risk. Required by React Server Components? Needs verification.
- **No Zod or equivalent input validation framework** — only 8 routes in the API directory show any validation keywords. Input shapes are largely unvalidated beyond TypeScript type assertions.
- **`time-series/route.ts` interpolates a validated string into SQL** — comment says "safe per T-25-02" but this is a pattern worth agent verification.
- **Only auth and public/v1/traces routes have rate limiting** — most API endpoints have no rate limiting.
- **CORS**: no explicit CORS headers found. Next.js defaults to same-origin. Verify no routes send `Access-Control-Allow-Origin: *`.
- **`npm audit` high: Next.js v16.2.4** has 13 CVEs including middleware/proxy bypass vulnerabilities (proxy-bypass, cache-poisoning, XSS in beforeInteractive scripts). Since auth enforcement lives in the middleware, proxy-bypass CVEs are **directly relevant to this app's threat model**.

### Domain C — Data/Memory Hotspots

- **Python `knowledge-mcp` uses `secrets.compare_digest` for bearer token** — correct constant-time comparison. Verify token is set in env and cannot be empty-string authenticated.
- **`voice-server/meeting_bot.py`** — comment says tokens are never logged; agent should verify no logging paths exist.
- **`mem0ai` service**: memory service `requirements.txt` pins `mem0ai>=0.1,<1.0` vs PyPI 2.0.2; may expose known vulnerabilities; `pip-audit` will confirm.
- **Orchestration `requirements.txt`** — no version pins on fastapi or uvicorn; unpinned deps in a security audit context.
- **SQLite WAL mode with `better-sqlite3`** — no path traversal risk but agent should verify DB file paths are hardcoded constants, not user-supplied.
- **`chromadb>=0.5,<1.0`** in memory service requirements — verify pip-audit finds no CVEs.

### Domain D — Architecture Hotspots

- **13 occurrences of `as any` or `: any`** in production code (excluding tests) — low absolute number but each one deserves a named finding if in a security-sensitive path.
- **TypeScript strict mode is enabled** (`"strict": true` in tsconfig) — good baseline; agent should verify no `// @ts-ignore` suppression of strict errors in auth/validation paths.
- **954 exports in `src/lib/`** — large surface; knip needed to identify which are dead.
- **`execFile` / `spawn` used in `chat/route.ts` and `health/route.ts`** — execSync is banned; execFile usage is allowed per STATE.md constraint. Agent should verify no user input reaches these calls unsanitized.
- **`execFileSync` used in `local-agent-runtime.ts`, `memory-recall-evals.ts`, `parsers.ts`** — allowed per constraints; agent should verify invocation patterns.
- **Python services lack consistent auth**: knowledge-mcp has bearer token auth; memory service (FastAPI) has no visible auth guard at service level — relies on network isolation.

---

## Audit Agent Execution Plan

### How to Structure Each Agent Run

Each domain agent should:
1. Run the prescribed automated tools for its domain (see below)
2. Perform a manual checklist review (see domain checklists below)
3. Produce findings in the schema above
4. Write to `109-{DOMAIN}-FINDINGS.md` in the phase directory

### Domain A Agent — Auth & Secrets

**Automated commands:**
```bash
# Semgrep: auth and secrets rulesets
semgrep --config=p/secrets --config=p/jwt apps/memroos/src/ services/ --json -o /tmp/semgrep-domain-a.json

# Gitleaks: git history scan (after install)
gitleaks detect --source=. --report-path=/tmp/gitleaks-domain-a.json

# Check for .env files not in gitignore
git ls-files | grep -E "\.env[^.]"
```

**Manual checklist:**
- [ ] MEMROOS_JWT_SECRET: minimum 256-bit entropy, not in source
- [ ] JWT algorithm: verify `alg` claim (HS256 minimum, RS256 preferred) in `lib/auth/jwt.ts`
- [ ] JWT expiry: access token and refresh token TTLs reasonable and enforced
- [ ] Cookie flags: HttpOnly ✓, SameSite (verify Lax is intentional), Secure (verify isProd logic)
- [ ] Refresh token revocation: verify token is hashed before storage, revocation path works
- [ ] `authorizeRegistryWrite` loopback bypass: cannot be reached via spoofed headers
- [ ] Per-agent API keys: key generation strength, storage mechanism, rotation support
- [ ] No hardcoded keys, passwords, or tokens in source (complement TruffleHog)
- [ ] `.env.example` covers all secrets; no real values in `.env.example`

### Domain B Agent — API Surface

**Automated commands:**
```bash
# Semgrep: injection + security rulesets
semgrep --config=p/owasp-top-ten --config=p/nodejs --config=p/nextjs apps/memroos/src/app/api/ --json -o /tmp/semgrep-domain-b.json

# Count routes vs proxy coverage
find apps/memroos/src/app/api -name "route.ts" | wc -l
grep -r "ROUTE_LOCAL_AUTH_API_ROUTES\|OPERATOR_ROUTES\|ADMIN_ROUTES" apps/memroos/src/proxy.ts
```

**Manual checklist:**
- [ ] Proxy matcher coverage: verify `config.matcher` has no blind spots for API routes
- [ ] ROUTE_LOCAL_AUTH_API_ROUTES: every entry has route-local auth implemented; verify there are no orphan bypasses
- [ ] SQL injection: review all `db.prepare()` calls — confirm no string interpolation of user input reaches SQL
- [ ] CSP: `unsafe-eval` in script-src — determine if removable; document if required by Next.js RSC
- [ ] Rate limiting: which endpoints are unprotected; assess risk per endpoint sensitivity
- [ ] CORS: confirm no routes send `Access-Control-Allow-Origin: *`
- [ ] Next.js CVEs (v16.2.4): assess which middleware-bypass CVEs are exploitable given this app's proxy.ts auth pattern
- [ ] Input validation: identify routes accepting untrusted body/query params without validation
- [ ] Iris/content scanner: verify coverage reaches all agent-facing text ingress paths, not just dispatch

### Domain C Agent — Data & Memory

**Automated commands:**
```bash
# pip-audit (after install)
pip install pip-audit && pip-audit -r services/knowledge-mcp/requirements.txt
pip-audit -r services/memory/requirements.txt
pip-audit -r services/orchestration/requirements.txt
pip-audit -r services/voice-server/requirements.txt

# bandit (after install)
pip install bandit && bandit -r services/ --format json -o /tmp/bandit-domain-c.json

# Check for pickle/yaml.load unsafe deserialization
grep -rn "pickle\|yaml\.load\|marshal\|shelve" services/ --include="*.py"
```

**Manual checklist:**
- [ ] `knowledge-mcp` bearer token: non-empty-string check, env var required at startup
- [ ] `memory service` (FastAPI): no auth at service level — document trust boundary (loopback-only? Docker network?)
- [ ] `orchestration service` (FastAPI): same trust boundary question
- [ ] `voice-server` meeting tokens: verify no logging of room_url or join token
- [ ] Unsafe YAML: `PyYAML.load()` without `Loader=yaml.SafeLoader` is RCE risk — scan all services
- [ ] Data leakage: verify memory API responses redact or filter based on policy-gate labels
- [ ] File path construction: any user-supplied paths in file operations?
- [ ] SQLite paths: hardcoded constants vs env-variable constructed paths
- [ ] ChromaDB and qdrant-client: pip-audit + check for known CVEs at installed versions
- [ ] `mem0ai 0.1.x` vs 2.0.2 gap: assess security implications of major version lag

### Domain D Agent — Architecture & Code Quality

**Automated commands:**
```bash
# Install and run madge for circular deps
npm install -g madge
madge --circular --ts-config apps/memroos/tsconfig.json apps/memroos/src/lib/ 2>/dev/null

# Install and run knip for dead code
npm install -g knip
cd apps/memroos && knip --reporter json 2>/dev/null > /tmp/knip-domain-d.json

# TypeScript strict compliance
cd apps/memroos && npx tsc --noEmit 2>&1 | tail -20

# Count unsafe casts
grep -rn "as any\|: any\b\|// @ts-ignore\|// @ts-expect-error" apps/memroos/src/ --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|\.d\.ts"

# Python ruff (after install)
pip install ruff && ruff check services/ --format json 2>/dev/null > /tmp/ruff-domain-d.json

# Python vulture for dead code (after install)
pip install vulture && vulture services/ 2>/dev/null | head -50

# GitNexus: use for architectural boundary analysis
# gitnexus_query "dispatch auth boundary"
# gitnexus_query "circular dependency"
# gitnexus_query "unused module"
```

**Manual checklist:**
- [ ] Circular dependency results from madge: map to specific module pairs
- [ ] Dead exports from knip: flag any in security-sensitive paths (auth, policy-gate, content-scanner)
- [ ] `as any` occurrences (13 found): assess each — is any in an auth or validation code path?
- [ ] Error handling consistency: do all route handlers return `{ ok: false, error: "..." }` shapes consistently?
- [ ] Redundant patterns: multiple auth check implementations? Multiple DB connection patterns?
- [ ] Cross-layer leakage: does UI code import from `lib/db` directly (should not)?
- [ ] Python architecture: do services import across service boundaries?
- [ ] `execFile`/`spawn`/`execFileSync` usage: verify no user-controlled arguments reach these calls

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret scanning | Custom regex patterns | semgrep + gitleaks | Thousands of known secret patterns; regex approach misses entropy-based detection |
| Dependency CVE lookup | Manual CVE search | npm audit + pip-audit | NVD integration built in; continuous updates |
| Circular dep detection | Manual import tracing | madge | Handles transitive cycles; outputs dot graph |
| Dead code detection | Manual export tracking | knip (TS), vulture (Python) | Handles re-exports, barrel files, dynamic requires |
| Python SAST | Manual code review only | bandit | 50+ test plugins for common Python security anti-patterns |
| Injection pattern detection | Content scanner regex | semgrep OWASP rules | Context-aware AST-level analysis vs naive regex |

---

## Common Pitfalls

### Pitfall 1: Misreading Auth Coverage from Route-Level Grep
**What goes wrong:** Counting routes without inline auth checks and concluding they are unauthenticated.
**Why it happens:** Auth is centralized in `proxy.ts` (Next.js middleware), not per-route.
**How to avoid:** AUDIT-02 agent must analyze `proxy.ts` matcher coverage, not just grep route files.
**Warning signs:** If an agent reports "90 unauthenticated routes" without analysis of proxy.ts, the finding is invalid.

### Pitfall 2: Missing Python Service Trust Boundaries
**What goes wrong:** Flagging missing auth on Python FastAPI services without documenting whether they are loopback-only or network-accessible.
**Why it happens:** Python services (memory, orchestration) expose FastAPI endpoints with no bearer auth — but they may intentionally rely on network isolation.
**How to avoid:** AUDIT-03 agent must document the intended trust boundary for each service (loopback, Docker internal network, or public-reachable) before assigning severity.

### Pitfall 3: Treating Informational Findings as High Severity
**What goes wrong:** Every `as any` cast rated "high", overwhelming the findings report.
**Why it happens:** Template-driven severity assignment without context.
**How to avoid:** Severity must reflect exploitability + impact. `as any` in a UI helper is low; `as any` in a JWT verification path is critical. Evidence field must justify severity.

### Pitfall 4: pip-audit Not Installed
**What goes wrong:** AUDIT-03 agent skips Python CVE check.
**Why it happens:** pip-audit is not installed on this machine (verified).
**How to avoid:** Plan Wave 0 must include `pip install pip-audit bandit ruff vulture` before any Domain C agent runs.

### Pitfall 5: Stale GitNexus Index
**What goes wrong:** GitNexus analysis returns stale architectural relationships.
**Why it happens:** Graph index must be refreshed if code has changed since last `npx gitnexus analyze`.
**How to avoid:** Domain D agent should run `gitnexus_detect_changes()` first and regenerate if stale before using graph queries.

---

## Architecture Patterns

### Recommended Phase Directory Output Structure
```
.planning/phases/109-parallel-domain-audit/
├── 109-RESEARCH.md              # This file
├── 109-PLAN.md                  # Planner output
├── 109-A-FINDINGS.md            # Domain A: Auth/Secrets
├── 109-B-FINDINGS.md            # Domain B: API Surface
├── 109-C-FINDINGS.md            # Domain C: Data/Memory
├── 109-D-FINDINGS.md            # Domain D: Architecture/Code Quality
└── 109-FINDINGS-INDEX.md        # Consolidated severity-ranked table
```

### Findings Index Schema (109-FINDINGS-INDEX.md)
The consolidated index enables phase 110 planner to `filter(severity == critical || high)` and get a work queue.

```markdown
| Finding ID | Domain | Title | Severity | Location | Fix Requirement |
|------------|--------|-------|----------|----------|-----------------|
| A01-001    | Auth   | ...   | critical | file:line | SEC-01 |
| B01-001    | API    | ...   | high     | file:line | SEC-02 |
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (TypeScript) + pytest (Python) |
| Config file | `apps/memroos/vitest.config.ts` / `pytest.ini` per service |
| Quick run command | `cd apps/memroos && npm test -- --run` |
| Full suite command | `cd apps/memroos && npm test -- --run && cd services/orchestration && pytest` |

### Phase Requirements → Verification Map

Phase 109 is a document-deliverable phase — verification is completeness-based, not behavioral-test-based.

| Req ID | Behavior | Verification Method |
|--------|----------|---------------------|
| AUDIT-01 | Auth domain findings report exists, covers all checklist items | Check `109-A-FINDINGS.md` exists and has non-empty findings table |
| AUDIT-02 | API surface findings report exists, covers all checklist items | Check `109-B-FINDINGS.md` exists and has non-empty findings table |
| AUDIT-03 | Data/memory findings report exists, covers all checklist items | Check `109-C-FINDINGS.md` exists and has non-empty findings table |
| AUDIT-04 | Architecture findings report exists, covers all checklist items | Check `109-D-FINDINGS.md` exists and has non-empty findings table |

**Phase gate:** All 4 domain reports exist + `109-FINDINGS-INDEX.md` populated with at least one finding per domain before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Install audit toolchain: `pip install pip-audit bandit ruff vulture && npm install -g madge knip` — prerequisite for Domains C and D
- [ ] No new test files needed (audit is document-producing, not code-changing)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| semgrep | Domain A, B SAST | ✓ | 1.132.0 | — |
| Node.js | Domain D tooling | ✓ | v26.0.0 | — |
| Python 3 | Domain C/D tooling | ✓ | 3.14.2 | — |
| pip-audit | Domain C CVE scan | ✗ | — | Manual CVE lookup (fallback lowers confidence) |
| bandit | Domain C SAST | ✗ | — | semgrep Python rules (partial coverage) |
| ruff | Domain D Python lint | ✗ | — | bandit covers security; ruff is quality |
| vulture | Domain D dead code (Python) | ✗ | — | Manual scan (incomplete) |
| gitleaks | Domain A git history scan | ✗ | — | TruffleHog already in CI for history |
| madge | Domain D circular deps | ✗ | — | Manual import tracing (incomplete for 647 files) |
| knip | Domain D dead exports | ✗ | — | ts-prune or manual (incomplete) |
| GitNexus | Domain D arch analysis | ✓ (in-repo) | — | Manual codebase exploration |

**Missing dependencies with no fallback (blockers for full coverage):**
- pip-audit: Python CVE coverage is blind without it
- madge: circular dep detection across 647 TS files is impractical manually

**Missing dependencies with fallback:**
- bandit → semgrep Python rules (lower precision)
- vulture → manual review (lower recall)
- gitleaks → TruffleHog CI history (already covered)
- knip → ts-prune (less comprehensive)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | jwt (jose 5.10), bcryptjs 3.0, route-local agent auth |
| V3 Session Management | yes | HttpOnly JWT cookies, refresh token rotation, revocation table |
| V4 Access Control | yes | RBAC via proxy.ts + ROLE_RANK, operator-auth.ts |
| V5 Input Validation | yes — GAP | No zod/joi; ad-hoc per route |
| V6 Cryptography | yes | AES-GCM envelope encryption (Phase 77), bcrypt for passwords |
| V7 Error Handling | partial | Inconsistency across 129 routes is an AUDIT-04 finding |
| V9 Communications | yes | CSP in proxy.ts; HTTPS flag on cookies |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Applicable | Standard Mitigation |
|---------|--------|-----------|---------------------|
| Next.js middleware bypass | Elevation of Privilege | YES — CVEs in v16.2.4 | Upgrade next.js; verify proxy.ts matcher |
| JWT algorithm confusion | Spoofing | Possible | Pin alg in verification; verify `lib/auth/jwt.ts` |
| SQL injection (better-sqlite3) | Tampering | Low (parameterized API used) | Verify no string interpolation; semgrep |
| YAML injection (PyYAML) | Tampering/RCE | Possible in Python services | Use `yaml.safe_load` everywhere |
| SSRF via webhook/remote agent URLs | Information Disclosure | Possible | Validate URL schemes before fetch |
| Prompt injection via agent payloads | Tampering | Active surface | Iris scanner covers dispatch; verify other ingress |
| Token leakage in logs | Information Disclosure | Possible | Verify voice-server, orchestration logging |
| Path traversal in file operations | Information Disclosure | Possible | Verify hardcoded DB paths, knowledge-mcp file ops |
| CSP bypass via unsafe-eval | XSS escalation | Present | Investigate if unsafe-eval is removable |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Per-route auth middleware | Centralized Next.js middleware (proxy.ts) | Reduces duplication but creates single-point-of-failure risk requiring explicit gap analysis |
| Grep-based secret scanning | AST-based + entropy scanning (semgrep + gitleaks) | Higher true positive rate; fewer missed secrets |
| Manual CVE tracking | npm audit + pip-audit (when installed) | Continuous CVE database; actionable fix commands |
| Hand-rolled circular dep detection | madge graph analysis | Handles transitive cycles correctly |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Audit agents are Opus 4 instances (described as "Opus 4.8" in phase description) | Summary | If model is unavailable or different, agent capability assumptions may not hold — use whatever Opus tier is available |
| A2 | All 4 Python service requirements files enumerate all production deps (no transitive security issues missed) | Domain C | If deps are installed outside requirements files, pip-audit coverage is incomplete |
| A3 | proxy.ts `config.matcher` catches all API routes (not verified by dynamic analysis) | Domain B hotspots | If matcher has gaps, AUDIT-02 proxy bypass risk may be higher than assessed |
| A4 | GitNexus graph index is current for the 11200 symbols described in CLAUDE.md | Domain D | Stale index gives misleading circular dep / boundary data — run `gitnexus_detect_changes()` before trusting |

---

## Open Questions

1. **Is `unsafe-eval` in CSP required by Next.js v16 App Router?**
   - What we know: CSP in proxy.ts includes `'unsafe-eval'` in script-src
   - What's unclear: Whether React Server Components or the React compiler require it
   - Recommendation: Domain B agent should check Next.js v16 docs in `node_modules/next/dist/docs/` before flagging severity

2. **What is the intended trust boundary for `services/memory` and `services/orchestration` FastAPI servers?**
   - What we know: No bearer auth visible at service level; Python services have no auth middleware
   - What's unclear: Whether these are loopback-only, Docker-internal, or potentially externally reachable
   - Recommendation: Domain C agent check `docker-compose.yml` port bindings and LaunchAgent service configs to determine exposure

3. **Next.js v16.2.4 CVE exploitability in this specific proxy.ts pattern**
   - What we know: 13 CVEs exist including middleware bypass variants
   - What's unclear: Which CVEs apply given this app's specific matcher pattern and absence of i18n/pages-router
   - Recommendation: Domain B agent consult Next.js security advisories and test proxy bypass patterns against `/api/auth/*` with prefetch headers

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `/Users/lcalderon/github/memroos/apps/memroos/src/` (read during research)
- `npm audit --json` output — verified 1 high (next), 3 moderate
- `semgrep --version` output — 1.132.0, installed at `/opt/homebrew`
- `.github/workflows/secret-guard.yml` — TruffleHog + custom pattern CI verified
- `proxy.ts` — security headers, RBAC, matcher, route lists all verified directly

### Secondary (MEDIUM confidence)
- STATE.md and REQUIREMENTS.md — project decisions and requirement definitions
- `apps/memroos/tsconfig.json` — strict mode confirmed

### Tertiary (LOW confidence)
- Claim that `mem0ai 0.1.x` has security issues vs 2.0.2 — not pip-audited; `[ASSUMED]` from STATE.md integration-modernization notes

---

## Metadata

**Confidence breakdown:**
- Domain coverage matrix: HIGH — derived directly from REQUIREMENTS.md sub-bullets and codebase structure
- Findings schema: HIGH — designed to map to SEC-xx/ARCH-xx requirements exactly
- Toolchain availability: HIGH — verified via `command -v` during research
- Preliminary scope signals: MEDIUM — codebase hotspots identified, but audit agents must verify before promoting to findings
- Python service trust boundaries: LOW — requires Docker/LaunchAgent config inspection not completed in research

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (npm deps change weekly; re-run `npm audit` before Phase 110 execution)
