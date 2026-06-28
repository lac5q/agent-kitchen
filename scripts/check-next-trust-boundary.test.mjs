import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseTrustBoundaryChecklist,
  validateNextTrustBoundary,
} from "./check-next-trust-boundary.mjs";

const GOOD_PROXY = `
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
`;

const GOOD_PROXY_TEST = `
it("rejects expired or malformed JWT credentials on protected API routes", () => {});
it("rejects reviewer role escalation on operator API routes", () => {});
it("does not let route-local auth path traversal bypass protected API auth", () => {});
it("Bearer token takes precedence over access_token cookies for API authorization", () => {});
`;

describe("next trust-boundary checker", () => {
  it("parses reviewed Next and proxy hash markers from the checklist", () => {
    const parsed = parseTrustBoundaryChecklist(`
# Next Trust Boundary Upgrade Checklist

- Reviewed Next.js dependency: \`^16.2.7\`
- Reviewed proxy sha256: \`abc123\`
`);

    assert.equal(parsed.nextDependency, "^16.2.7");
    assert.equal(parsed.proxySha256, "abc123");
  });

  it("accepts matching Next dependency, proxy hash, and regression tests", () => {
    const result = validateNextTrustBoundary({
      nextDependency: "^16.2.7",
      checklistText: `
- Reviewed Next.js dependency: \`^16.2.7\`
- Reviewed proxy sha256: \`proxy-hash\`
- Keep matcher coverage with unstable_doesProxyMatch.
- Run npm run check:next-trust-boundary.
`,
      proxyText: GOOD_PROXY,
      proxySha256: "proxy-hash",
      proxyTestText: GOOD_PROXY_TEST,
      middlewareExists: false,
      files: new Set([
        "apps/memroos/src/__tests__/proxy.test.ts",
        "apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts",
        "apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts",
        "apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts",
        "apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts",
        "apps/memroos/src/app/api/hive/__tests__/route.test.ts",
        "apps/memroos/src/app/api/model-routing/__tests__/route.test.ts",
      ]),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("fails when the checklist was not refreshed for a Next upgrade or proxy edit", () => {
    const result = validateNextTrustBoundary({
      nextDependency: "^16.3.0",
      checklistText: `
- Reviewed Next.js dependency: \`^16.2.7\`
- Reviewed proxy sha256: \`old-hash\`
- Keep matcher coverage with unstable_doesProxyMatch.
- Run npm run check:next-trust-boundary.
`,
      proxyText: GOOD_PROXY,
      proxySha256: "new-hash",
      proxyTestText: GOOD_PROXY_TEST,
      middlewareExists: false,
      files: new Set(["apps/memroos/src/__tests__/proxy.test.ts"]),
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("Next dependency")));
    assert.ok(result.errors.some((error) => error.includes("proxy sha256")));
  });
});
