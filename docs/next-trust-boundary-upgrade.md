# Next Trust Boundary Upgrade Checklist

MemRoOS runs public marketing pages and the operator app from one Next.js build.
The request trust boundary is `apps/memroos/src/proxy.ts`; route-local guards are
the defense-in-depth layer for privileged APIs.

## Reviewed Baseline

- Reviewed Next.js dependency: `^16.2.7`
- Reviewed proxy sha256: `fdc825842e8d759a6d4333554f73d4e950e28c76b059b54969a6779d8d5c7874`

  Re-attested 2026-07-28. Change: added `POST /api/audit/knowledge` to
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
