# Next Trust Boundary Upgrade Checklist

MemRoOS runs public marketing pages and the operator app from one Next.js build.
The request trust boundary is `apps/memroos/src/proxy.ts`; route-local guards are
the defense-in-depth layer for privileged APIs.

## Reviewed Baseline

- Reviewed Next.js dependency: `^16.2.7`
- Reviewed proxy sha256: `6fc8c681a6eec09343874b5b5947a2ccb76c89681dfb13e0218082b3e74f10bc`

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
