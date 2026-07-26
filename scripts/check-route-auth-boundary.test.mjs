import { describe, it } from "node:test";
import assert from "node:assert/strict";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";

import {
  parseRouteLocalAuthPatterns,
  validateRouteAuthBoundary,
  patternToGlob,
  walkRouteFiles,
  enumerateExactFilePaths,
  ROUTE_FILE_RE,
} from "./check-route-auth-boundary.mjs";

const PROXY_FIXTURE = `
const ROUTE_LOCAL_AUTH_API_ROUTES: Array<{ method?: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\\/api\\/onboarding\\/script$/ },
  { method: "POST", pattern: /^\\/api\\/onboarding\\/register$/ },
  { pattern: /^\\/api\\/chatgpt\\/actions\\// },
  { pattern: /^\\/api\\/agent-context(?:\\/|$)/ },
  { pattern: /^\\/api\\/gsd(?:\\/|$)/ },
  { method: "POST", pattern: /^\\/api\\/agent-memory\\/capture$/ },
  { method: "POST", pattern: /^\\/api\\/agent-memory\\/handoff$/ },
  { method: "POST", pattern: /^\\/api\\/agents\\/register$/ },
  { method: "POST", pattern: /^\\/api\\/dispatch$/ },
  { method: "POST", pattern: /^\\/api\\/heartbeat$/ },
  { method: "POST", pattern: /^\\/api\\/memory\\/add$/ },
  { method: "GET", pattern: /^\\/api\\/memory\\/health$/ },
  { method: "GET", pattern: /^\\/api\\/memory\\/search$/ },
  { pattern: /^\\/api\\/memory\\/evals\\// },
  { method: "GET", pattern: /^\\/api\\/recall$/ },
  { method: "POST", pattern: /^\\/api\\/recall\\/ingest$/ },
  { method: "POST", pattern: /^\\/api\\/skills\\/report$/ },
  { pattern: /^\\/api\\/skillforge\\// },
  { method: "POST", pattern: /^\\/api\\/operations\\/telemetry$/ },
  { method: "POST", pattern: /^\\/api\\/tool-attention\\/record$/ },
];
`;

const AUTH_MARKERS = {
  agent: "authenticateAgentHeaders(",
  operator: "authorizeRegistryWrite(",
  chatgpt: "authorizeChatGptAction(",
  human: "authenticateUser(",
};

function goodFiles() {
  return new Map([
    ["apps/memroos/src/app/api/onboarding/script/route.ts", "verifyAgentOnboardingToken("],
    ["apps/memroos/src/app/api/onboarding/register/route.ts", "verifyAgentOnboardingToken("],
    ["apps/memroos/src/app/api/chatgpt/actions/search/route.ts", AUTH_MARKERS.chatgpt],
    ["apps/memroos/src/app/api/chatgpt/actions/fetch/route.ts", AUTH_MARKERS.chatgpt],
    ["apps/memroos/src/app/api/chatgpt/actions/save/route.ts", AUTH_MARKERS.chatgpt],
    ["apps/memroos/src/app/api/agent-context/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/agent-context/messages/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/agent-context/messages/[id]/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/agent-context/messages/[id]/ack/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/agent-context/messages/[id]/reply/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/goal/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/resume/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/shipcheck/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/standup/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/discuss/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/skill-audit/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/skill-boundary/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/lane-eval/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/model-route/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/gsd/adapter/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/agent-memory/capture/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/agent-memory/handoff/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/agents/register/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/dispatch/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/heartbeat/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/memory/add/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/memory/health/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/memory/search/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/memory/evals/latest/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/memory/evals/run/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/recall/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/recall/ingest/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/skills/report/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/skillforge/status/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/skillforge/trigger/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/skillforge/cycle/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/skillforge/proposals/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/operations/telemetry/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/tool-attention/record/route.ts", AUTH_MARKERS.agent],
    ["apps/memroos/src/app/api/onboarding/invite/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/evals/config/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/evals/run/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/seal/proposals/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/seal/proposals/[id]/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/l3/poll/route.ts", AUTH_MARKERS.operator],
    ["apps/memroos/src/app/api/auth/invite/route.ts", AUTH_MARKERS.human],
    ["apps/memroos/src/lib/__tests__/operator-auth.test.ts", "blocks non-local registry writes"],
    ["apps/memroos/src/app/api/agent-context/__tests__/route.test.ts", "rejects unauthorized"],
    ["apps/memroos/src/app/api/gsd/__tests__/route.test.ts", "requires authenticated agent keys"],
    ["apps/memroos/src/app/api/gsd/__tests__/extended-route.test.ts", "requires authenticated agent keys"],
    ["apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts", "blocks direct non-local"],
    ["apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts", "blocks direct non-local"],
    ["apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts", "blocks direct non-local"],
    ["apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts", "blocks direct non-local"],
    ["apps/memroos/src/app/api/hive/__tests__/route.test.ts", "blocks direct non-local"],
    ["apps/memroos/src/app/api/model-routing/__tests__/route.test.ts", "blocks direct non-local"],
  ]);
}

describe("route auth boundary checker", () => {
  it("parses proxy route-local auth patterns", () => {
    assert.deepEqual(parseRouteLocalAuthPatterns(PROXY_FIXTURE), [
      "/^\\/api\\/onboarding\\/script$/",
      "/^\\/api\\/onboarding\\/register$/",
      "/^\\/api\\/chatgpt\\/actions\\//",
      "/^\\/api\\/agent-context(?:\\/|$)/",
      "/^\\/api\\/gsd(?:\\/|$)/",
      "/^\\/api\\/agent-memory\\/capture$/",
      "/^\\/api\\/agent-memory\\/handoff$/",
      "/^\\/api\\/agents\\/register$/",
      "/^\\/api\\/dispatch$/",
      "/^\\/api\\/heartbeat$/",
      "/^\\/api\\/memory\\/add$/",
      "/^\\/api\\/memory\\/health$/",
      "/^\\/api\\/memory\\/search$/",
      "/^\\/api\\/memory\\/evals\\//",
      "/^\\/api\\/recall$/",
      "/^\\/api\\/recall\\/ingest$/",
      "/^\\/api\\/skills\\/report$/",
      "/^\\/api\\/skillforge\\//",
      "/^\\/api\\/operations\\/telemetry$/",
      "/^\\/api\\/tool-attention\\/record$/",
    ]);
  });

  it("accepts covered proxy bypass and operator routes", () => {
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: goodFiles(),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it("fails when a proxy bypass pattern lacks coverage", () => {
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE.replace("];", "  { pattern: /^\\/api\\/new-privileged\\// },\n];"),
      fileTexts: goodFiles(),
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("new-privileged")));
  });

  it("fails when a covered handler loses its local auth marker", () => {
    const files = goodFiles();
    files.set("apps/memroos/src/app/api/memory/add/route.ts", "export async function POST() {}");
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: files,
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("memory/add/route.ts")));
  });

  // AUTHGATE-03: a regression test proves the gate fails on a fixture
  // route under an exempt prefix with no auth marker. The fixture is
  // enumerated through the filesystemRouteFiles interface so the
  // coverage-set stricture can detect it.
  it("fails when a new route is added under an exempt prefix without a coverage entry", () => {
    const enumerated = [
      "apps/memroos/src/app/api/gsd/p187-fixture/route.ts",
    ];
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: goodFiles(),
      filesystemRouteFiles: enumerated,
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("p187-fixture/route.ts")));
  });

  it("fails when an enumerated route lacks a handler-local auth marker", () => {
    // The route is in coverage but its file text has no auth marker.
    const files = goodFiles();
    files.set("apps/memroos/src/app/api/gsd/goal/route.ts", "export async function POST() { return new Response('ok'); }");
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: files,
      filesystemRouteFiles: ["apps/memroos/src/app/api/gsd/goal/route.ts"],
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("gsd/goal/route.ts")));
  });

  it("accepts a public-metadata allowlist entry without an auth marker", () => {
    // The chatgpt/actions/openapi route is allowlisted; the stricture
    // for missing markers should skip it.
    const files = goodFiles();
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: files,
      filesystemRouteFiles: ["apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts"],
    });

    assert.equal(result.ok, true);
  });

  // Regression: the validator (Opus 4.8) caught that the original
  // `isPrefix` regex matched `\/\/` (one backslash + one slash + end)
  // instead of `\/\/` (the regex-source form for a prefix pattern:
  // escaped slash + closing delimiter slash). All three prefix patterns
  // in the proxy were silently classified as `exact`, which skipped
  // the directory-tree walk. This test pins the shape detection.
  it("classifies the three regex shapes correctly (regression for the isPrefix bug)", () => {
    const cases = [
      ["/^\\/api\\/onboarding\\/script$/", "exact"],
      ["/^\\/api\\/gsd(?:\\/|$)/", "prefix"],
      ["/^\\/api\\/skillforge\\//", "prefix"],
      ["/^\\/api\\/chatgpt\\/actions\\//", "prefix"],
      ["/^\\/api\\/memory\\/evals\\//", "prefix"],
    ];
    for (const [pattern, expected] of cases) {
      const glob = patternToGlob(pattern);
      assert.equal(glob.mode, expected, `pattern ${pattern} expected mode=${expected}, got ${glob.mode}`);
    }
  });

  it("catches a fixture under a bare-slash prefix pattern (regression for the isPrefix bug)", () => {
    // A new route under /api/skillforge/ — bare-slash prefix pattern.
    // Before the fix, the gate passed this silently because the
    // isPrefix regex misclassified bare-slash prefixes as "exact".
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: goodFiles(),
      filesystemRouteFiles: ["apps/memroos/src/app/api/skillforge/p187-bug-repro/route.ts"],
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("skillforge/p187-bug-repro/route.ts")));
  });

  // Regression: the validator (Opus 4.8) caught that the original
  // walk only matched `route.ts`, leaving `route.tsx`/`route.js`/
  // `route.jsx`/`route.mjs`/`route.mts` under an exempt prefix
  // silently allowed. The fix widens the regex; this test pins it.
  it("catches a fixture under a .tsx route handler (regression for the route.ts-only walk)", () => {
    const result = validateRouteAuthBoundary({
      proxyText: PROXY_FIXTURE,
      fileTexts: goodFiles(),
      filesystemRouteFiles: ["apps/memroos/src/app/api/gsd/p187-tsx/route.tsx"],
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("route.tsx")));
  });

  // Direct unit tests for the walk + route-file regex. These exercise
  // the actual code path (walkRouteFiles over a real temp tree) rather
  // than the higher-level validateRouteAuthBoundary. The validator
  // (Opus 4.8) caught that the array-injection tests above could pass
  // even with bugs in the walk — these direct tests cannot.
  describe("walkRouteFiles + ROUTE_FILE_RE (direct unit coverage)", () => {
    function makeTree(files) {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "authgate-walk-"));
      try {
        for (const [rel, content] of Object.entries(files)) {
          const abs = nodePath.join(root, rel);
          nodeFs.mkdirSync(nodePath.dirname(abs), { recursive: true });
          nodeFs.writeFileSync(abs, content);
        }
      } catch (e) {
        nodeFs.rmSync(root, { recursive: true, force: true });
        throw e;
      }
      return { root, cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }) };
    }

    it("walks every App Router extension, not just route.ts", () => {
      const t = makeTree({
        "a/route.ts": "",
        "b/route.tsx": "",
        "c/route.js": "",
        "d/route.jsx": "",
        "e/route.mjs": "",
        "f/route.mts": "",
        "g/not-route.ts": "",
        "h/route.ts.bak": "",
      });
      try {
        const matches = walkRouteFiles(t.root).map((p) => nodePath.relative(t.root, p)).sort();
        assert.deepEqual(matches, [
          "a/route.ts",
          "b/route.tsx",
          "c/route.js",
          "d/route.jsx",
          "e/route.mjs",
          "f/route.mts",
        ]);
      } finally {
        t.cleanup();
      }
    });

    it("enumerates every existing route file under an exact path", () => {
      const t = makeTree({
        "route.ts": "",
        "route.tsx": "",
        "not-route.txt": "",
      });
      try {
        const matches = enumerateExactFilePaths(t.root).map((p) => nodePath.relative(t.root, p)).sort();
        assert.deepEqual(matches, ["route.ts", "route.tsx"]);
      } finally {
        t.cleanup();
      }
    });

    it("returns an empty array for a missing exact path", () => {
      assert.deepEqual(enumerateExactFilePaths("/nonexistent/abcdef/12345"), []);
    });
  });

  // Live enumeration against a real temp tree. The validator (Opus 4.8)
  // caught that the array-injection tests above could pass with a wrong
  // patternToGlob root — the path.relative resolution would just produce
  // garbage paths and the coverage-set check would silently accept them.
  // This test builds a sandbox repo rooted at a temp directory, points
  // the validation at it via customRepoRoot/customApiRoot, and exercises
  // the full walk → cover → marker pipeline against real on-disk files.
  describe("live enumeration against a real temp tree", () => {
    function makeSandbox(files) {
      const repoRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "authgate-sandbox-"));
      const apiRoot = nodePath.join(repoRoot, "apps/memroos/src/app/api");
      nodeFs.mkdirSync(apiRoot, { recursive: true });
      for (const [rel, content] of Object.entries(files)) {
        const abs = nodePath.join(apiRoot, rel);
        nodeFs.mkdirSync(nodePath.dirname(abs), { recursive: true });
        nodeFs.writeFileSync(abs, content);
      }
      return {
        repoRoot,
        apiRoot,
        cleanup: () => nodeFs.rmSync(repoRoot, { recursive: true, force: true }),
      };
    }

    // Drive the live enumeration path (filesystemRouteFiles: true) against
    // a temp tree. The fixture file is unknown to the production
    // coverage list, so the test asserts the gate flags it as a missing
    // coverage entry. This is the "the walk actually found the file"
    // proof that the array-injection tests above could not provide.
    it("a sandboxed /api/gsd/foo/route.ts is flagged when absent from coverage", () => {
      const t = makeSandbox({
        "gsd/foo/route.ts": "export async function POST() { return new Response('ok'); }",
      });
      try {
        const result = validateRouteAuthBoundary({
          proxyText: PROXY_FIXTURE,
          fileTexts: goodFiles(),
          filesystemRouteFiles: true,
          repoRoot: t.repoRoot,
          apiRoot: t.apiRoot,
        });
        assert.ok(
          result.errors.some((e) => e.includes("gsd/foo/route.ts")),
          `expected an error for gsd/foo/route.ts; got: ${JSON.stringify(result.errors)}`,
        );
      } finally {
        t.cleanup();
      }
    });

    it("a sandboxed /api/skillforge/foo/route.ts is flagged (bare-slash prefix)", () => {
      const t = makeSandbox({
        "skillforge/foo/route.ts": "export async function POST() { return new Response('ok'); }",
      });
      try {
        const result = validateRouteAuthBoundary({
          proxyText: PROXY_FIXTURE,
          fileTexts: goodFiles(),
          filesystemRouteFiles: true,
          repoRoot: t.repoRoot,
          apiRoot: t.apiRoot,
        });
        assert.ok(
          result.errors.some((e) => e.includes("skillforge/foo/route.ts")),
          `expected an error for skillforge/foo/route.ts; got: ${JSON.stringify(result.errors)}`,
        );
      } finally {
        t.cleanup();
      }
    });
  });
});
