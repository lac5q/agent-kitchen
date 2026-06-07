# Domain B — API Surface Audit (AUDIT-02)

**Plan:** 109-03
**Generated:** 2026-06-07
**Auditor:** Domain B agent (parallel domain audit, Wave 2)
**Scope:** Missing auth guards, input validation, injection (SQLi/XSS/SSTI), rate limiting, CORS, Next.js v16.2.4 CVE exploitability.
**Method:** Auth coverage derived from `proxy.ts` matcher + bypass-list analysis (NOT per-route grep — RESEARCH.md Pitfall 1). semgrep `p/owasp-top-ten`,`p/nodejs`,`p/nextjs` on `apps/memroos/src/app/api/`. Read-only; no source files modified.

---

## Proxy Auth Coverage Analysis (load-bearing)

### `config.matcher`

Literal value from `apps/memroos/src/proxy.ts:230-232`:

```
matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
```

**Coverage:** Negative-lookahead excludes only `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`. **All `/api/*` paths match** and pass through `proxy()` → `enforceAuth()`. No API blind spot in the matcher. `enforceAuth` (proxy.ts:140) gates every `/api/*` path that is not `/api/auth/*` or `/api/public/*` behind a valid JWT + role >= reviewer, unless the path is on the route-local-auth bypass list.

API route count (`find apps/memroos/src/app/api -name route.ts | wc -l`): **129**.

### `ROUTE_LOCAL_AUTH_API_ROUTES` bypass list (proxy.ts:76-90)

These paths bypass proxy JWT enforcement and MUST implement route-local auth. Every entry was opened and verified:

| # | Pattern | Method | Route file(s) | Local auth | Mechanism |
|---|---------|--------|---------------|------------|-----------|
| 1 | `/api/chatgpt/actions/` | any | actions/{search,fetch,save}/route.ts | yes | `authorizeChatGptAction(request)` |
| 1b | `/api/chatgpt/actions/openapi` | GET | actions/openapi/route.ts | N/A (intentional) | Public OpenAPI spec doc; no secrets returned (see B01-003) |
| 2 | `/api/agent-context/` | any | agent-context/messages/**(+[id]/reply/ack) | yes | per-route 401 (agent header auth) |
| 3 | `/api/agent-memory/capture` | POST | agent-memory/capture/route.ts | yes | `authorizeRegistryWrite(request)` |
| 4 | `/api/agent-memory/handoff` | POST | agent-memory/handoff/route.ts | yes | `authorizeRegistryWrite(request)` |
| 5 | `/api/agents/register` | POST | agents/register/route.ts | yes | `authorizeRegistryWrite(request)` |
| 6 | `/api/dispatch` | POST | dispatch/route.ts | yes | session + `ROLE_RANK.operator` check |
| 7 | `/api/heartbeat` | POST | heartbeat/route.ts | yes | `authenticateAgentHeaders(...)` → 401 |
| 8 | `/api/memory/add` | POST | memory/add/route.ts | yes | per-route 401 |
| 9 | `/api/skills/report` | POST | skills/report/route.ts | yes | per-route 401 |
| 10 | `/api/skillforge/` | any | skillforge/{trigger,cycle,status,proposals}/route.ts | yes | `authorizeRegistryWrite(request)` (operator-only) |
| 11 | `/api/tool-attention/record` | POST | tool-attention/record/route.ts | yes | per-route 401 |

**Result: zero orphan bypasses.** Every bypass-list path implements route-local auth. The only un-authenticated bypass path is `chatgpt/actions/openapi` (GET) which serves a static OpenAPI 3.1 spec document — intentional and secret-free.

### Role-gate lists (defense-in-depth, enforced at proxy for JWT routes)

- `ADMIN_ROUTES` (proxy.ts:72): `POST /api/auth/invite` → admin.
- `OPERATOR_ROUTES` (proxy.ts:62): onboarding/invite, evals/config|run, seal/*, l3/poll → operator.
- Default floor: all other `/api/*` JWT routes require role >= `reviewer`.

These are matched **inside** `enforceAuth` only after a valid JWT, so they layer on top of authentication, not in place of it.

---

## Severity-Ranked Findings

| ID | Severity | Title | Location | Fix Req |
|----|----------|-------|----------|---------|
| B01-001 | high | Next.js v16.2.4 middleware/proxy-bypass CVEs apply (auth lives in middleware) | apps/memroos/package.json (next ^16.2.4); proxy.ts | SEC-04 |
| B01-002 | medium | CSP `unsafe-eval` set unconditionally in script-src (not required in prod per Next.js docs) | apps/memroos/src/proxy.ts:101 | SEC-03 |
| B01-003 | low | `chatgpt/actions/openapi` reflects `x-forwarded-host` into spec base URL | apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts:6-13 | SEC-03 |
| B01-004 | medium | No input-validation framework (zod absent); route bodies validated ad-hoc / by type assertion | apps/memroos/src/app/api/** (multiple) | SEC-03 |
| B01-005 | medium | No rate limiting on non-auth endpoints (only auth + public/v1/traces protected) | apps/memroos/src/app/api/** (multiple) | SEC-03 |

---

## Full Findings

### B01-001 — Next.js v16.2.4 middleware/proxy-bypass CVEs
- **Domain:** B (API Surface)
- **Severity:** high
- **Location:** `apps/memroos/package.json` (next `^16.2.4`); enforcement surface `apps/memroos/src/proxy.ts`
- **Evidence:** Toolchain baseline (109-01) records 13 next advisories in range 16.0.0–16.2.5. Three are middleware/proxy bypass variants directly relevant because auth enforcement is centralized in `proxy.ts` (Next.js middleware): GHSA-26hh-7cqf-hhc6 (segment-prefetch bypass follow-up), GHSA-492v-c6pp-mqqv (dynamic route parameter injection bypass), GHSA-267c-6grr-h53f (segment-prefetch routes bypass). Also relevant: GHSA-3g8h-86w9-wvmq (middleware redirect cache-poisoning), GHSA-ffhc-5mcf-pf4q (App Router CSP-nonce XSS).
- **Applicability assessment (this app's pattern):**
  - App Router only — confirmed `apps/memroos/src/pages` absent. **No i18n config** in next.config → GHSA-36qx-fr4f-26g5 (Pages-Router i18n bypass) does NOT apply.
  - The segment-prefetch / dynamic-param bypass CVEs (GHSA-26hh, GHSA-492v, GHSA-267c) target exactly the App-Router middleware-auth pattern this app uses, where `enforceAuth` returns 401/redirect from middleware. A successful prefetch/param-injection bypass would let an attacker reach an `/api/*` handler without the JWT check executing → **authentication bypass with no credentials**.
- **Impact:** Unauthenticated reach of protected API handlers if a bypass CVE is weaponized; this is the single-point-of-failure risk noted in the threat model (T-109-B-01).
- **Remediation:** Upgrade `next` to the first patched release >= 16.2.5 (the advisory fix line). Re-run `npm audit` to confirm the 13 advisories clear. Until upgraded, the centralized-middleware auth model should be treated as at-risk.
- **Mapped Fix Requirement:** SEC-04 (dependency CVE, type-routed regardless of severity label — RESEARCH.md fix-routing rule + Open Question 3).
- **Confidence:** verified (npm audit baseline + advisory IDs + matcher/router pattern confirmed).

### B01-002 — CSP `unsafe-eval` in script-src is unconditional
- **Domain:** B
- **Severity:** medium
- **Location:** `apps/memroos/src/proxy.ts:101`
- **Evidence:** `withSecurityHeaders` sets `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com` for every response, with no dev/prod branch. Next.js v16 primary docs (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:42`) state verbatim: *"In development, `'unsafe-eval'` is required because React uses `eval`... `unsafe-eval` is not required for production. Neither React nor Next.js use `eval` in production by default."*
- **Impact:** `unsafe-eval` (and `unsafe-inline`) defeat a primary CSP defense: they let an injected/reflected script string execute via `eval`/`new Function`/inline. This is an XSS *escalation* gap (defense-in-depth) — not a standalone exploit — so medium per the severity rubric. It widens blast radius of any future XSS.
- **Remediation:** Gate `unsafe-eval` behind `NODE_ENV !== 'production'`. Longer term, adopt the Next.js nonce + `strict-dynamic` pattern (docs lines 48-113) to drop `unsafe-inline` from script-src as well. RESOLVES Open Question 1: `unsafe-eval` is removable in production.
- **Mapped Fix Requirement:** SEC-03 (medium security finding).
- **Confidence:** verified (proxy.ts source + Next.js primary docs).

### B01-003 — OpenAPI spec reflects untrusted `x-forwarded-host`
- **Domain:** B
- **Severity:** low
- **Location:** `apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts:6-13`
- **Evidence:** `publicBaseUrl()` falls back to `request.headers.get("x-forwarded-host") ?? host` and reflects it into the spec's server base URL when `MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL` is unset. The endpoint is intentionally unauthenticated (public spec). It is read-only and returns no secrets; the reflected host only affects the advertised base URL in a JSON document.
- **Impact:** A client fetching the spec with a forged `x-forwarded-host` would see an attacker-controlled base URL. No server-side fetch (no SSRF), no privilege change. Low.
- **Remediation:** Prefer the configured `MEMROOS_CHATGPT_ACTIONS_PUBLIC_BASE_URL` env in all environments, or validate host against an allowlist before reflecting.
- **Mapped Fix Requirement:** SEC-03 (low — optional hardening).
- **Confidence:** verified (route source read).

### B01-004 — No input-validation framework
- **Domain:** B
- **Severity:** medium
- **Location:** `apps/memroos/src/app/api/**` (multiple — pattern-level)
- **Evidence:** No zod/joi/yup dependency. Route handlers parse `await request.json()` and apply ad-hoc `typeof` checks or TypeScript `as` assertions (e.g. heartbeat/route.ts:31 `typeof body?.agentId === "string"`). Type assertions provide no runtime guarantee. Numeric query params are individually clamped where present (skills/import limit/offset clamped to <=100), but body shape is unvalidated across the surface.
- **Impact:** Malformed/oversized/unexpected-type bodies reach business logic; defense-in-depth gap (ASVS V5). No direct injection confirmed (SQL is parameterized — see Coverage Attestation), so medium not high.
- **Remediation:** Adopt a schema validator (zod) at route boundaries for bodies/queries, starting with agent-callable bypass-list routes that take untrusted input.
- **Mapped Fix Requirement:** SEC-03.
- **Confidence:** likely (framework absence verified; per-route exhaustive enumeration not performed — pattern-level finding).

### B01-005 — No rate limiting on non-auth endpoints
- **Domain:** B
- **Severity:** medium
- **Location:** `apps/memroos/src/app/api/**` (multiple)
- **Evidence:** Only `auth/login`, `auth/refresh`, and `public/v1/traces` reference rate limiting (`grep -rln rateLimit`). Agent-callable bypass-list endpoints (dispatch, heartbeat, memory/add, skills/report, agent-context, skillforge) and read endpoints (recall, time-series, memory-stats) have no throttle.
- **Impact:** DoS / resource exhaustion via unrate-limited writes and DB-heavy reads (T-109-B-04). Requires reachability but no special privilege for the bypass routes (they accept agent/operator keys). Risk-rank: highest on `dispatch` and `memory/add` (write + downstream LLM/vector work), medium on read-heavy `recall`/`time-series`, lower on operator-gated `skillforge`.
- **Remediation:** Apply the existing rate-limit utility (already used in auth routes) to agent-write and DB-read endpoints; prioritize dispatch and memory/add.
- **Mapped Fix Requirement:** SEC-03 (accept/mitigate per threat register).
- **Confidence:** verified (grep of rate-limit usage across api/).

---

## SQL Injection Verification (T-109-B-02)

All template-literal `db.prepare()` sites reviewed for user-input interpolation. **Every site uses bound `?` parameters for user data; only server-controlled / allowlisted tokens are interpolated.**

| Route | Interpolated token | Source | Verdict |
|-------|-------------------|--------|---------|
| time-series/route.ts:133,145,157,169 | `${since}` | `getWindowConfig(window)` returns a hardcoded `datetime('now','-N day')` literal; `window` allowlist-validated against `VALID_WINDOWS` (route returns 400 otherwise). `bucketFormat` is a bound `?` param. | SAFE — **"safe per T-25-02" claim VERIFIED** |
| memory-stats/route.ts:88,95 | `scopedMessages.clause` | Built from `normalizeNocWorkspace` enum (`all`/`local`/`remote`); user values bound via `...params`. | SAFE |
| operations/noc/route.ts:72 | `${ws}` | `workspaceClause(workspace)` from `NocWorkspace` enum; timestamp bound via `?`. | SAFE |
| skills/import/route.ts:158,166,173 | `${where}` | Static `"col = ?"` fragments; all user values pushed to bound `params`; limit/offset clamped. | SAFE |
| recall/route.ts:95 | `${placeholders}` | `ids.map(()=>'?')` — generated `?` placeholders only, ids bound via `...ids`. | SAFE |
| hive/route.ts | — | Fully parameterized (`WHERE x = ?`). | SAFE |

No string interpolation of raw request input into SQL was found.

---

## Coverage Attestation

| # | Checklist Item | Status |
|---|----------------|--------|
| 1 | Proxy matcher blind spots | CLEAN — matcher `/((?!_next/static\|_next/image\|favicon.ico\|icon.svg).*)` matches all `/api/*`; verified in proxy.ts:230. |
| 2 | ROUTE_LOCAL_AUTH bypass-list orphans | CLEAN — all 11 bypass patterns verified to implement route-local auth (table above); zero orphans. |
| 3 | SQL injection (better-sqlite3 db.prepare) | CLEAN — all interpolated tokens server-controlled/allowlisted, user data bound via `?`; time-series "safe per T-25-02" VERIFIED. |
| 4 | CSP unsafe-eval in script-src | FINDING: B01-002 — unconditional `unsafe-eval`; Next.js docs confirm not needed in prod (Open Question 1 RESOLVED). |
| 5 | Rate limiting | FINDING: B01-005 — only auth + public/v1/traces protected; agent-write + DB-read endpoints unthrottled. |
| 6 | CORS configuration | CLEAN — no `Access-Control-Allow-Origin` header anywhere in src/ (grep empty); Next.js same-origin default. |
| 7 | Next.js v16.2.4 CVEs | FINDING: B01-001 (SEC-04) — App-Router middleware/segment-prefetch bypass CVEs apply; i18n/Pages-Router CVE does not (no i18n, App Router only). Open Question 3 RESOLVED. |
| 8 | Input validation | FINDING: B01-004 — no zod/joi; ad-hoc type assertions on bodies. |
| 9 | Iris/content-scanner ingress coverage | NOT CHECKED — deferred to AUDIT-03 (Domain C, data/memory). Iris/scanner ingress beyond dispatch is a data-handling trust-boundary item; flagged here, owned by 109-04 per Domain Coverage Matrix seam rule. SSTI: N/A — no server-side template engine (no Handlebars/EJS/Pug); JSX is React-escaped. |
| — | semgrep SAST (p/owasp-top-ten, p/nodejs, p/nextjs) | CLEAN — 185 files scanned, 0 findings; 4 `warn` errors are TS-generic syntax parser noise in `*.test.ts` files only, no production-route scan failure. `/tmp/semgrep-domain-b.json` valid JSON. |

Status legend: `CLEAN` | `FINDING: {ID}` | `N/A — {reason}` | `NOT CHECKED — {blocker}`.

---

## Summary Stats

| Severity | Count | IDs |
|----------|-------|-----|
| critical | 0 | — |
| high | 1 | B01-001 |
| medium | 3 | B01-002, B01-004, B01-005 |
| low | 1 | B01-003 |
| **Total** | **5** | — |

**By fix requirement:** SEC-04 ×1 (B01-001), SEC-03 ×4 (B01-002, B01-003, B01-004, B01-005).

**Tooling:** semgrep 1.132.0 (`p/owasp-top-ten`,`p/nodejs`,`p/nextjs`) → 185 files, 0 findings → `/tmp/semgrep-domain-b.json`.

**Key resolutions:**
- Open Question 1 (CSP unsafe-eval): removable in production → B01-002 (medium).
- Open Question 3 (Next.js CVE exploitability): App-Router prefetch/param-injection bypass CVEs apply; i18n CVE does not → B01-001 (SEC-04).
- time-series "safe per T-25-02" SQL claim: VERIFIED safe.
- Zero orphan bypasses in ROUTE_LOCAL_AUTH_API_ROUTES.

**Prior-baseline note:** No Phase 68/69/74-78 closed findings re-filed. CR-08 x-forwarded-host loopback-spoofing fix confirmed present in operator-auth.ts.
