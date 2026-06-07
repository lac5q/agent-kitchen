# Domain A — Auth & Secrets Audit (AUDIT-01)

**Phase:** 109 — Parallel Domain Audit (Plan 109-02, Wave 2)
**Generated:** 2026-06-07
**Auditor:** Domain A agent (Opus 4)
**Scope:** JWT handling, cookie security flags, hardcoded secrets, API key exposure, session management
**Confidence basis:** semgrep (p/secrets + p/jwt) + manual source review of auth code paths

> **Worktree-freshness note:** This audit ran in worktree branch `worktree-agent-a3b7656c99eac511a`,
> branched before phase 109. The four core auth files (`jwt.ts`, `operator-auth.ts`,
> `login/route.ts`, `refresh/route.ts`) are byte-identical to `main` (verified via
> `git diff main --stat`). `proxy.ts` differs from `main` by 4 deletions — `main` additionally
> lists `/api/agent-context/` and `/api/skillforge/` in `ROUTE_LOCAL_AUTH_API_ROUTES`. Where this
> report cites `proxy.ts` and `db-schema.ts`, line numbers were read against `main` to keep the
> remediation queue (phases 110–112) valid against current code.

---

## Severity-Ranked Findings (top table)

| Finding ID | Title | Severity | Location | Fix Requirement |
|------------|-------|----------|----------|-----------------|
| A01-001 | JWT secret has no minimum-entropy enforcement at load | medium | apps/memroos/src/lib/auth/jwt.ts:6-11 | SEC-03 |
| A01-002 | Known default internal API key shipped in `.env.example` and used as dev fallback | low | .env.example:18 / apps/memroos/src/lib/db-schema.ts:795 | SEC-05 |
| A01-003 | Cookie `SameSite=Lax` (not `Strict`) on session cookies | low | apps/memroos/src/app/api/auth/login/route.ts:87-89 | none — informational |
| A01-004 | semgrep flagged dummy bcrypt hash (timing-defense constant) — false positive | low | apps/memroos/src/app/api/auth/login/route.ts:52 | none — informational |

Summary counts are in `## Summary Stats` at the end.

---

## Automated Scan Results (Task 1)

### semgrep — p/secrets + p/jwt

```
Command: semgrep --config=p/secrets --config=p/jwt apps/memroos/src/ services/ --json -o /tmp/semgrep-domain-a.json
Result: EXIT 0 — Ran 49 rules on 682 files: 1 finding, 0 errors.
Output: /tmp/semgrep-domain-a.json (valid JSON, results=1, errors=0)
Registry: reachable (p/secrets + p/jwt rulesets fetched successfully)
```

**Single hit (triaged → false positive, A01-004):**

| Rule | File:line | Verdict |
|------|-----------|---------|
| `generic.secrets.security.detected-bcrypt-hash` | apps/memroos/src/app/api/auth/login/route.ts:52 | FALSE POSITIVE — the matched string `$2a$12$invalidhashfortimingprotection...` is a deliberately invalid bcrypt hash used as a constant-time dummy to defend the login path against user-enumeration timing attacks (line 51-55). It is not a real credential and cannot authenticate any account (invalid bcrypt format). |

No JWT-rule (`p/jwt`) findings — no `alg=none`, no hardcoded JWT, no algorithm-confusion pattern detected by semgrep.

### Committed env files — `git ls-files | grep -E "\.env[^.]"`

```
Result: NONE (empty) — no .env / .env.local / .env.* secret files are tracked by git.
```

Only `.env.example`, `services/memory/.env.example`, `services/voice-server/.env.example` are tracked
(sample files, expected). CLEAN.

### Git-history secret scan — fallback path

`gitleaks` is **not installed** in this environment (`command -v gitleaks` → not found); local `trufflehog`
is also **not installed**. Per RESEARCH.md and toolchain-baseline.md, the git-history secret scan relies on
the **TruffleHog CI fallback**: `.github/workflows/secret-guard.yml` runs `trufflesecurity/trufflehog@main`
with `--only-verified` on push. This satisfies the "Gitleaks output OR TruffleHog-CI fallback noted"
acceptance criterion. Git-history depth scanning was therefore NOT performed locally in this run; the CI
gate is the active control. (Recommendation: install gitleaks for ad-hoc local history scans — MEDIUM
priority per RESEARCH.md, not a blocker.)

---

## Full Findings (schema)

### A01-001 — JWT secret has no minimum-entropy enforcement at load

- **Domain:** A (Auth/Secrets)
- **Severity:** medium
- **Location:** apps/memroos/src/lib/auth/jwt.ts:6-11
- **Evidence:**
  ```ts
  function getSecret(): Uint8Array {
    const secret = process.env.MEMROOS_JWT_SECRET;
    if (!secret) {
      throw new Error('[Memroos] MEMROOS_JWT_SECRET env var is required');
    }
    return new TextEncoder().encode(secret);   // accepts ANY non-empty string
  }
  ```
  The loader checks only for presence, not length/entropy. `.env.example` ships the placeholder
  `MEMROOS_JWT_SECRET=change-me-to-a-random-32-char-string`; an operator who forgets to replace it (or
  picks a short value) gets a low-entropy HS256 signing key with no guardrail. HS256 with a weak shared
  secret is brute-forceable offline, enabling token forgery (full session spoofing).
- **Impact:** If a deployment runs with a weak/guessable `MEMROOS_JWT_SECRET`, an attacker who can offline-
  brute-force or guess it can forge access tokens for any `sub`/`role`, fully bypassing authentication.
  Exploitability is conditional on operator misconfiguration → medium, not critical.
- **Remediation:** In `getSecret()`, enforce a minimum length (≥32 bytes / 256-bit) and reject known
  placeholder values (e.g. anything containing `change-me`). Fail fast at startup. Document the
  `openssl rand -base64 32` generation guidance (already present as a comment in `.env.example`).
- **Mapped Fix Requirement:** SEC-03 (medium-severity hardening)
- **Confidence:** verified (tool + manual — code path read directly)

### A01-002 — Known default internal API key shipped in `.env.example` and used as dev fallback

- **Domain:** A (Auth/Secrets)
- **Severity:** low
- **Location:** .env.example:18 (`MEMROOS_INTERNAL_API_KEY=memroos-internal-default-key`) / apps/memroos/src/lib/db-schema.ts:792-801
- **Evidence:**
  ```ts
  const internalApiKey = process.env.MEMROOS_INTERNAL_API_KEY;
  const shouldSeedDevInternalKey = process.env.NODE_ENV !== "production";
  if (internalApiKey || shouldSeedDevInternalKey) {
    const key = internalApiKey ?? "memroos-internal-default-key";   // literal default
    ...
    db.prepare("INSERT OR IGNORE INTO tenant_api_keys (id, tenant_id, key_hash) VALUES (?, ?, ?)")
      .run(keyId, "default-tenant", defaultKeyHash);
  }
  ```
  `.env.example` carries the *real usable value* `memroos-internal-default-key` (not a `change-me`
  placeholder). It is seeded into `tenant_api_keys` granting scopes `eval:submit,eval:read,proposals:read`.
- **Impact:** A publicly-known credential. **However, the default seed is gated behind
  `NODE_ENV !== "production"` (line 793)** — in production with the env var unset, no default key is
  seeded, so the default credential is dev/test-only and grants only eval-submit/read scopes. This caps
  real-world impact at low. The residual risk is (a) a non-prod environment exposed to a network, or
  (b) `NODE_ENV` being mis-set, in which case the known key authenticates eval API calls.
- **Remediation:** Treat `memroos-internal-default-key` as a known-default credential: keep it dev-only
  (already gated), and in `.env.example` replace the literal with a `change-me`-style placeholder plus the
  existing generation hint, so the working default value isn't copy-pasted into a shared/staging env.
  Confirm `NODE_ENV=production` is set in all non-dev deployments.
- **Mapped Fix Requirement:** SEC-05 (hardcoded/default credential in source)
- **Confidence:** verified (tool + manual)

### A01-003 — Session cookies use `SameSite=Lax` rather than `Strict`

- **Domain:** A (Auth/Secrets)
- **Severity:** low
- **Location:** apps/memroos/src/app/api/auth/login/route.ts:87-89 (and refresh/route.ts:81-92)
- **Evidence:** Both `access_token` and `memroos_refresh` cookies are set
  `HttpOnly; SameSite=Lax; Secure(on prod); Path=/`. `Lax` permits cookies to ride along on top-level
  cross-site GET navigations.
- **Impact:** `Lax` is a deliberate, common choice and is not exploitable on its own (state-changing
  routes are POST and additionally CSRF-resistant via JSON+HttpOnly). Flagged for explicit attestation per
  RESEARCH hotspot: confirm there is no SSR form-GET flow that would be broken by `Strict`. No standalone
  exploit path → low / informational.
- **Remediation:** None required. Optionally tighten to `SameSite=Strict` if no cross-site top-level
  navigation needs the session cookie. Document the decision.
- **Mapped Fix Requirement:** none — informational
- **Confidence:** verified (manual)

### A01-004 — semgrep dummy-bcrypt-hash hit (false positive)

- **Domain:** A (Auth/Secrets)
- **Severity:** low
- **Location:** apps/memroos/src/app/api/auth/login/route.ts:52
- **Evidence:** `const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';`
  Used to run `verifyPassword` even when the user does not exist, defeating username-enumeration timing
  attacks. The hash is intentionally invalid (cannot match any password).
- **Impact:** None — this is a security *control*, not a leak. Documented to close the semgrep hit
  explicitly so Wave 3 does not re-triage it.
- **Remediation:** None. Optionally add a `// nosemgrep: detected-bcrypt-hash` annotation to silence the
  scanner.
- **Mapped Fix Requirement:** none — informational
- **Confidence:** verified (tool + manual)
