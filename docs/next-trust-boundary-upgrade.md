# Next Trust Boundary Upgrade Checklist

MemRoOS runs public marketing pages and the operator app from one Next.js build.
The request trust boundary is `apps/memroos/src/proxy.ts`; route-local guards are
the defense-in-depth layer for privileged APIs.

## Reviewed Baseline

- Reviewed Next.js dependency: `^16.2.7`
- Reviewed proxy sha256: `d819657727102112420e500aab1aed45d43a90ad6bff3a352721a02e03aca901`

  Re-attested 2026-08-05. Change (PR #6, Phase 229): added
  `{ method: "POST", pattern: /^\/api\/agent-report$/ }` to
  `ROUTE_LOCAL_AUTH_API_ROUTES`, so that one route authenticates itself
  instead of being session-gated by the proxy.

  Reviewed against the handler. `POST /api/agent-report` accepts four
  principals: an agent API key, an MCP OAuth bearer, an operator session
  carrying `agent-reports:manage`, and — deliberately — one unauthenticated
  lane for the onboarding script, which has no credentials yet by
  construction. That lane is narrow: it is refused outright if any
  `authorization` header is present, requires `component === "onboarding"`,
  requires `tokenKid` to match `^[0-9a-f]{8}$`, and is rate-limited and
  size-capped like every other path.

  **Residual risk, accepted:** `tokenKid` is format-checked, not signature-
  verified, so an anonymous caller who knows the request shape can write
  onboarding-component rows. The exposure is bounded to inserting rows in
  `agent_issue_reports` behind the rate limiter — it grants no read access,
  and the proxy pattern is anchored to `POST` on the collection, so `GET`
  and `PATCH` (including `/api/agent-report/[id]`) remain session-gated.
  Worth revisiting if these reports ever feed an automated action.

  Re-attested 2026-08-01. Change (commit `813519b9`): added a rule 1c
  bypass for `/.well-known/*`, ahead of the login-redirect fallback.
  OAuth discovery is unauthenticated by construction — a client reads
  authorization-server metadata to find out *how* to authenticate, so
  gating it makes registration impossible. Previously these requests fell
  through to rule 4 and were answered with a 307 to `/login`; a connector
  asking for JSON received an HTML redirect, which is what surfaced as
  "Couldn't register with Memroos's sign-in service". The pre-existing
  A2A agent-card routes were silently broken the same way.

  Reviewed exposure: four routes exist under the prefix —
  `oauth-authorization-server` (RFC 8414), `oauth-protected-resource`
  (RFC 9728), `agent.json` and `agent-card.json` (A2A discovery). All are
  static path segments; there is no dynamic or catch-all segment under
  `.well-known/`, so the bypass cannot be steered at other content. Each
  returns only endpoint metadata, and none reads a credential, secret or
  per-user record.

  **Standing condition:** the rule is a `startsWith("/.well-known/")`
  prefix match, so any route added under that prefix in future is public
  the moment it is created, with no further review. Anything placed there
  must be non-secret by construction.

  Verified `proxy.ts` still exports a named `proxy` function (not
  `middleware`) and configures no Edge runtime. Test evidence in the same
  commit: `proxy.test.ts` gains "serves /.well-known discovery documents
  without authentication" and "does not let a look-alike .well-known
  prefix bypass authentication", the latter asserting `/.well-known-decoy/`
  still redirects to `/login`.

  Attestation prepared by an agent (Claude Opus 5) from the diff and route
  inventory above; it records analysis, not human sign-off, and wants an
  operator countersignature.

  Prior attestation (2026-07-31,
  `0df324c2bfe8c4a29faa12299eaa10f3d4b8199e3d3189dfd6f12a0f10113339`):
  added `POST /api/model-routing/telemetry` to
  `ROUTE_LOCAL_AUTH_API_ROUTES`. Token-usage shippers
  (`scripts/ship-claude-token-usage.mjs`) post model token telemetry from host
  machines using the operator key — no user session, so no JWT. The handler
  enforces `authorizeRegistryWrite` (operator key or loopback);
  route-auth-boundary coverage was extended in the same change and the
  pre-existing "blocks direct non-local telemetry writes" regression test
  verifies the handler-local denial. Verified `proxy.ts` still exports a
  named `proxy` function (not `middleware`) and configures no Edge runtime.

  Prior attestation (2026-07-28,
  `fdc825842e8d759a6d4333554f73d4e950e28c76b059b54969a6779d8d5c7874`):
  added `POST /api/audit/knowledge` to
  `ROUTE_LOCAL_AUTH_API_ROUTES`. That route is the MCP's central-audit bridge
  and authenticates itself against `MEMROOS_AGENT_API_KEY` with a
  constant-time compare (`verifyAgentApiKey`), because its caller is a
  server-side MCP process with no user session and therefore no JWT. Before
  this, the proxy returned 401 ahead of the handler, and since knowledge reads
  fail closed when the audit POST fails, every knowledge_search/read in
  operator mode was dead. Verified `proxy.ts` still exports a named `proxy`
  function (not `middleware`) and configures no Edge runtime.

## Required Before Changing Next Or Proxy

1. Read the current Next proxy documentation. The installed
   `node_modules/next/dist/docs` directory may be absent; if so, use the
   official Next docs for the installed major/minor.
2. Confirm `apps/memroos/src/proxy.ts` still exports a named `proxy` function,
   not `middleware`, and does not configure an Edge runtime.
3. Keep matcher coverage in `apps/memroos/src/__tests__/proxy.test.ts` using
   `unstable_doesProxyMatch` for static exclusions and API inclusion.
4. Keep adversarial proxy coverage for expired or malformed JWT credentials,
   reviewer role escalation, route-local auth path traversal, and Bearer token
   precedence over `access_token` cookies.
5. Run the route-local auth regression set:
   - `apps/memroos/src/__tests__/proxy.test.ts`
   - `apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts`
   - `apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts`
   - `apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts`
   - `apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts`
   - `apps/memroos/src/app/api/hive/__tests__/route.test.ts`
   - `apps/memroos/src/app/api/model-routing/__tests__/route.test.ts`
6. Run `npm run check:next-trust-boundary`.
7. If either the Next dependency or `proxy.ts` changes, update the reviewed
   baseline markers above in the same commit as the test evidence.

## Verification Command

```bash
npm run check:next-trust-boundary
```
