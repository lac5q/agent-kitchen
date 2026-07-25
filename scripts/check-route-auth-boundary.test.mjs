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
});
