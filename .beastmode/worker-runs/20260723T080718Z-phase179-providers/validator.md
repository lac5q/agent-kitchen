# Phase 179 / v8.23 — Tool Auth Plane — Validator Report

**Validator:** Claude Opus 4.8 (claude-pro lane)
**Date:** 2026-07-23
**Branch:** beastmode/v8.23-tool-auth-plane
**Scope:** read-only review of the tool-auth plane against the GSD contract + Kimi UX spec.

## 1. Verdict

**REVISE** — The architecture, types, provider registry, Nango client, vault store shape, and route wiring are all sound and the orchestrator's typecheck/lint/test evidence holds, but `appendActivityEvent()` writes to **`audit_entries` columns that do not exist**, and it is called unconditionally by all three write routes, so OAuth-connect, API-key-connect, and disconnect all throw a 500 at runtime. One-line SQL fix + a test that exercises the module.

## 2. Factual accuracy vs Kimi UX design spec

Matches: page title/description/eyebrow (§11), search filter (§1), usage meter with plan + "X of Y connections used" + conditional Upgrade CTA (§1/§11), recent-activity strip last-5 (§1), category grouping with counts and empty-category collapse (§2/§6), search-empty message (§7), first-run empty card (§7), API-key sheet from right with Eye/EyeOff toggle + docs link + `aria-label` on the visibility toggle (§4/§10), revoke confirmation sheet with `variant="terra"` destructive button + optimistic cache removal + rollback (§5/§9), skeleton grid with `aria-busy`/`aria-label` (§2/§10), Lucide-only icons, no toast-emoji glyphs (§13).

Functional / spec gaps (not pedantic):
- **Connected card is thin (§2/§11/§12).** Spec calls for scope summary, "Last used" timestamp, truncated connection ID with copy-to-clipboard, and a **Rotate token** button. None are rendered — only account email + Revoke. `RotateCw` is imported then discarded (`void RotateCw`, page.tsx:737); `CopyToClipboardButton` is absent.
- **API-key sheet has no "Test connection" step (§4).** Spec makes it required; the sheet only has Save/Cancel.
- **Multi-field API-key providers can't be connected.** Registry describes `aws` ("Access key id … and secret access key") and `plaid` ("Client id and secret") as two-secret, but the sheet renders a single field and the route reads only `credentials.apiKey ?? credentials.key` (api-key/route.ts:59). AWS/Plaid are effectively unusable.
- **No aria-live announcements and no status-badge aria-label (§10).** `StatusBadge` renders text only; spec requires e.g. `aria-label="Connected to Slack as ops@example.com"`. No `aria-live="polite"` region for success/error.
- **Error card has no Retry (§2).** For `status==="error"` the card shows only Revoke (no Retry secondary).
- **"Connection status unavailable" banner not rendered (§7).** The connections route returns `warnings:[{source:"nango"}]` on upstream error, but page.tsx never reads it; `useUsage` uses `retry:false` and the meter silently returns `null`. Degraded-Nango state is invisible to the user.
- **OAuth uses `popup.closed` polling, not `postMessage` (§3).** Functional fallback, but there is no return handshake, no success toast, and no `settings/tools` "Filter: All" dropdown or "Show expired only" toggle from the §1 wireframe.

None of these are contract blockers on their own; collectively they justify REVISE alongside the runtime bug in §5.

## 3. Provider registry sanity — PASS

15 providers across all 5 categories (productivity 4, developer 4, crm 3, finance 3, other 1). Every OAuth provider carries non-empty `scopes` + `providerConfigKey`; every API-key provider carries `apiKeyField` + an `https://` `docsUrl` (asserted by providers.test.ts:58-74). Icon stand-ins are reasonable for lucide-react@1.7.0 (Slack→MessageCircle, Notion→FileText, GitHub→GitBranch, comment at providers.ts:6-9). Duplicate keys throw at module init (providers.ts:319-321); keys match `^[a-z][a-z0-9-]*$`. Category order is deterministic. No issues. (Note: the registry diverges from spec §6's exact roster — adds Google Calendar/Supabase/AWS/Salesforce/Intercom/Xero/Plaid/generic-rest, omits Microsoft 365/Circleback/QuickBooks — but the roster is not a contract, and 12+ providers / 4+ categories is satisfied.)

## 4. Nango client correctness — PASS (with unverified endpoints)

- `createNangoConnectSession` POSTs `/connect/sessions` with `allowed_integrations` + `end_user.email` (nango-client.ts:130-139) — confirmed by nango-client.test.ts:91-98.
- `deleteNangoConnection` swallows 404 as success, rethrows others (nango-client.ts:150-159) — confirmed by tests.
- `getNangoUsage` tier boundaries are exactly `<=10 free / <=100 starter / <=1000 growth / else enterprise` (nango-client.ts:181-182).
- Config vs upstream distinction is intentional and correct: `ToolAuthConfigError` re-thrown, upstream errors swallowed to a permissive `{used:0, limit:MAX_SAFE_INTEGER, plan:"enterprise"}` sentinel (nango-client.ts:170-176) so a Nango outage never shows a false "at limit" banner. Confirmed by test.
- **Secret leakage:** low risk. `ToolAuthUpstreamError.body` holds the parsed Nango error JSON, not the request; the `Authorization: Bearer` header is never echoed back. Routes surface only `err.message`/`err.status`, never `body`, so nothing sensitive reaches the client or logs.
- **Unverified assumptions (risk, not defect):** `getNangoUsage` hits `/connect/sessions/usage` and `buildAuthorizeUrl` constructs `https://connect.nango.dev?session_token=…&integration_id=…` (oauth/route.ts:97-100). Both are asserted "stable as of 2026-07-23" in comments but only exercised against mocks. If the real Connect flow needs the JS SDK rather than a query-param URL, the OAuth happy path won't complete against live Nango.

## 5. Credential store — one CRITICAL defect

- OAuth record stores metadata only, `sensitivity: null` (credential-store.ts:79-97) — correct; no refresh token.
- API-key record seals the secret in the vault body with `sensitivity: "credential"` (a valid `VaultSensitivity` member) and `policy:"sealed"` (credential-store.ts:129-139) — correct; key never placed in a label.
- `deleteVaultConnection` deletes `artifact_labels` + `raw_artifacts` in a transaction, then best-effort `fs.unlinkSync` with the cleanup documented (credential-store.ts:240-257) — correct.
- **CRITICAL — `appendActivityEvent` targets nonexistent columns (credential-store.ts:285-296).** It runs:
  ```
  INSERT INTO audit_entries (event_type, actor_type, actor_id, target_type, target_id, metadata_json, created_at)
  ```
  The Phase-64 `audit_entries` schema (db-schema.ts:3455-3467) is `(id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)`. Columns `actor_type`, `target_type`, `target_id` **do not exist**, and required NOT-NULL columns `id`, `actor_role`, `entity_type`, `entity_id` are omitted. `better-sqlite3` throws at `.prepare()`: *"table audit_entries has no column named actor_type."* The correct pattern is in artifact-gate.ts:75-79. Because `appendActivityEvent` is **not** wrapped in try/catch (unlike artifact-gate's best-effort insert), the throw propagates. Failure scenarios:
  - `POST /api/tools/connect/api-key`: vault write **succeeds**, then `appendActivityEvent` throws, the catch block calls `appendActivityEvent` again (throws again) → uncaught → **500** with a misleading `vault_write_failed`, despite the key being stored.
  - `POST /api/tools/disconnect`: vault row **deleted**, then `appendActivityEvent(connection_revoked)` throws → **500**, so revoke reports failure after succeeding.
  - `POST /api/tools/connect/oauth` (Nango configured): session created, then throws → **500**.
  - `listActivityEvents` reads `audit_entries` fine but will always be empty because no write ever lands → the "Recent activity" strip (spec §1) is dead.
  This is the headline fix: correct the column list/order to match the schema (add `id`, `actor_role`, use `entity_type`/`entity_id`), matching artifact-gate.ts.

## 6. API routes — PASS with two nits

All 7 routes call `authenticateUser(req)` and return 401 on no session. Zod validates `providerKey` (1–64) and `credentials` as `record(string 1–4096)`. Error mapping `ConfigError→503 / UpstreamError→502` is consistent in providers/connections/usage/oauth. `/connections` merges vault + Nango with Nango winning per key (connections/route.ts:54-56) — correct. OAuth variable shadowing is fixed (`nangoSession`, oauth/route.ts:59). Nits: (a) in `/disconnect`, a `ToolAuthConfigError` from `deleteNangoConnection` (Nango unconfigured but a `nangoConnectionId` was passed) is not an `UpstreamError`, so it falls through to a **502** rather than 503 — minor inconsistency; (b) all three write routes are currently un-runnable due to §5.

## 7. UI page gaps

5 states present (Connected / Expired / Error / Not connected badges + Loading skeleton). Search filter, activity strip, usage meter + Upgrade CTA, and the destructive revoke sheet with optimistic update all render. Gaps carried from §2: no scope/last-used/connection-ID/Rotate on the connected card, no Test-connection, no status-badge `aria-label`, no `aria-live`, no error-state Retry, no degraded-Nango banner, and no 10s loading timeout/retry (spec §13). Sheet focus management is inherited from the shadcn `Sheet` primitive (acceptable). `revoke.onError` only `console.error`s — no user-facing error toast (spec §5).

## 8. Tests

Providers: 9 tests, good coverage of categories/keys/scopes/docs/guards. Nango: 8 tests (config error, map, 5xx, session POST body, 404-as-success, non-404 rethrow, sentinel, tier) — solid (the prompt's "9" is off by one; total is 19 = 9+8+2). **Credential store: 2 tests, and they bypass the module** — they call `writeVaultArtifact`/`readVaultArtifact` directly rather than `storeApiKeyConnection`/`storeOAuthConnection`/`appendActivityEvent`/`listActivityEvents`/`deleteVaultConnection`. That is exactly why the §5 defect passed CI. Add tests that (a) round-trip through `storeApiKeyConnection` + `readApiKey`, (b) call `appendActivityEvent` then `listActivityEvents` against a real `initSchema` DB (this would have caught the column bug), and (c) exercise `deleteVaultConnection`.

## 9. Out-of-scope confirmation — PASS

No Phase 176 (Linear/Circleback) consumer migration; no changes to `/api/auth/*`; no SaaS layer; memroos is not made an OAuth server (it delegates to Nango). All four exclusions hold.

## 10. Risk register

1. **credential-store.ts:285-296** — `audit_entries` column mismatch breaks all three write endpoints at runtime (CRITICAL, must-fix; see §5).
2. **credential-store.test.ts** — tests bypass the module's own exported functions; `appendActivityEvent`/`listActivityEvents`/`deleteVaultConnection`/`storeApiKeyConnection` are entirely untested (HIGH — masked #1).
3. **api-key/route.ts:59** — only `credentials.apiKey`/`key` is read; multi-secret providers `aws` and `plaid` in the registry cannot be connected (MEDIUM).
4. **oauth/route.ts:97-100 & nango-client.ts:172** — `connect.nango.dev` query-param URL and `/connect/sessions/usage` endpoint are unverified against live Nango; OAuth manual smoke may not complete (MEDIUM).
5. **credential-store.ts:72-110** — `storeOAuthConnection` is dead code; no `/connect/oauth/callback` route exists to materialize the vault record (LOW; OAuth relies on `listNangoConnections`).
6. **page.tsx / connections route** — `warnings[]` and usage-error states are computed but never surfaced; degraded Nango is silent (LOW, spec §7).
7. **disconnect/route.ts** — `ToolAuthConfigError` maps to 502 not 503 (LOW).
