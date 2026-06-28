#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const proxyPath = path.join(repoRoot, "apps/memroos/src/proxy.ts");

const routeLocalAuthCoverage = [
  {
    pattern: "/^\\/api\\/chatgpt\\/actions\\//",
    files: [
      ["apps/memroos/src/app/api/chatgpt/actions/search/route.ts", ["authorizeChatGptAction("]],
      ["apps/memroos/src/app/api/chatgpt/actions/fetch/route.ts", ["authorizeChatGptAction("]],
      ["apps/memroos/src/app/api/chatgpt/actions/save/route.ts", ["authorizeChatGptAction("]],
    ],
    notes: ["apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts is public metadata only."],
  },
  {
    pattern: "/^\\/api\\/agent-context\\//",
    files: [
      ["apps/memroos/src/app/api/agent-context/messages/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/ack/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/reply/route.ts", ["authenticateAgentHeaders("]],
    ],
  },
  {
    pattern: "/^\\/api\\/agent-memory\\/capture$/",
    files: [["apps/memroos/src/app/api/agent-memory/capture/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/agent-memory\\/handoff$/",
    files: [["apps/memroos/src/app/api/agent-memory/handoff/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/agents\\/register$/",
    files: [["apps/memroos/src/app/api/agents/register/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/dispatch$/",
    files: [["apps/memroos/src/app/api/dispatch/route.ts", ["authorizeRegistryWrite(", "authenticateUser("]]],
  },
  {
    pattern: "/^\\/api\\/heartbeat$/",
    files: [["apps/memroos/src/app/api/heartbeat/route.ts", ["authenticateAgentHeaders("]]],
  },
  {
    pattern: "/^\\/api\\/memory\\/add$/",
    files: [["apps/memroos/src/app/api/memory/add/route.ts", ["authenticateAgentHeaders("]]],
  },
  {
    pattern: "/^\\/api\\/memory\\/evals\\//",
    files: [
      ["apps/memroos/src/app/api/memory/evals/latest/route.ts", ["authorizeRegistryWrite("]],
      ["apps/memroos/src/app/api/memory/evals/run/route.ts", ["authorizeRegistryWrite("]],
    ],
  },
  {
    pattern: "/^\\/api\\/skills\\/report$/",
    files: [["apps/memroos/src/app/api/skills/report/route.ts", ["authenticateAgentHeaders("]]],
  },
  {
    pattern: "/^\\/api\\/skillforge\\//",
    files: [
      ["apps/memroos/src/app/api/skillforge/status/route.ts", ["authorizeRegistryWrite("]],
      ["apps/memroos/src/app/api/skillforge/trigger/route.ts", ["authorizeRegistryWrite("]],
      ["apps/memroos/src/app/api/skillforge/cycle/route.ts", ["authorizeRegistryWrite("]],
      ["apps/memroos/src/app/api/skillforge/proposals/route.ts", ["authorizeRegistryWrite("]],
    ],
  },
  {
    pattern: "/^\\/api\\/tool-attention\\/record$/",
    files: [["apps/memroos/src/app/api/tool-attention/record/route.ts", ["authenticateAgentHeaders("]]],
  },
];

const proxyOperatorCoverage = [
  ["apps/memroos/src/app/api/onboarding/invite/route.ts", ["authorizeRegistryWrite(", "requireRole("]],
  ["apps/memroos/src/app/api/evals/config/route.ts", ["authorizeRegistryWrite("]],
  ["apps/memroos/src/app/api/evals/run/route.ts", ["authorizeRegistryWrite("]],
  ["apps/memroos/src/app/api/seal/proposals/route.ts", ["authorizeRegistryWrite(", "authenticateUser("]],
  ["apps/memroos/src/app/api/seal/proposals/[id]/route.ts", ["authorizeRegistryWrite(", "authenticateUser("]],
  ["apps/memroos/src/app/api/l3/poll/route.ts", ["authorizeRegistryWrite("]],
  ["apps/memroos/src/app/api/auth/invite/route.ts", ["authenticateUser(", "requireRole("]],
];

const requiredRegressionTests = [
  ["apps/memroos/src/lib/__tests__/operator-auth.test.ts", ["blocks non-local registry writes"]],
  ["apps/memroos/src/app/api/agent-context/__tests__/route.test.ts", ["rejects unauthorized"]],
  ["apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/hive/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/model-routing/__tests__/route.test.ts", ["blocks direct non-local"]],
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export function parseRouteLocalAuthPatterns(proxyText) {
  const match = proxyText.match(/const ROUTE_LOCAL_AUTH_API_ROUTES[\s\S]*?\n\];/);
  if (!match) return [];
  return match[0]
    .split("\n")
    .map((line) => line.match(/pattern:\s*([^,\s}]+)/)?.[1])
    .filter((pattern) => pattern?.startsWith("/"));
}

function hasAnyMarker(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

function checkFiles(files, errors, label) {
  for (const [relativePath, markers] of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${label} file is missing: ${relativePath}`);
      continue;
    }
    const text = fs.readFileSync(absolutePath, "utf8");
    if (!hasAnyMarker(text, markers)) {
      errors.push(`${label} file lacks handler-local auth marker (${markers.join(" or ")}): ${relativePath}`);
    }
  }
}

export function validateRouteAuthBoundary({ proxyText, fileTexts }) {
  const errors = [];
  const routeLocalPatterns = parseRouteLocalAuthPatterns(proxyText);
  const coveredPatterns = new Set(routeLocalAuthCoverage.map((entry) => entry.pattern));

  for (const pattern of routeLocalPatterns) {
    if (!coveredPatterns.has(pattern)) {
      errors.push(`Proxy route-local auth pattern lacks coverage: ${pattern}`);
    }
  }
  for (const pattern of coveredPatterns) {
    if (!routeLocalPatterns.includes(pattern)) {
      errors.push(`Route auth coverage references pattern not present in proxy.ts: ${pattern}`);
    }
  }

  for (const entry of routeLocalAuthCoverage) {
    for (const [relativePath, markers] of entry.files) {
      const text = fileTexts.get(relativePath);
      if (text === undefined) {
        errors.push(`Route-local auth file is missing: ${relativePath}`);
      } else if (!hasAnyMarker(text, markers)) {
        errors.push(`Route-local auth file lacks marker (${markers.join(" or ")}): ${relativePath}`);
      }
    }
  }

  for (const [relativePath, markers] of proxyOperatorCoverage) {
    const text = fileTexts.get(relativePath);
    if (text === undefined) {
      errors.push(`Proxy operator/admin route file is missing: ${relativePath}`);
    } else if (!hasAnyMarker(text, markers)) {
      errors.push(`Proxy operator/admin route file lacks marker (${markers.join(" or ")}): ${relativePath}`);
    }
  }

  for (const [relativePath, markers] of requiredRegressionTests) {
    const text = fileTexts.get(relativePath);
    if (text === undefined) {
      errors.push(`Route-auth regression test is missing: ${relativePath}`);
    } else if (!hasAnyMarker(text, markers)) {
      errors.push(`Route-auth regression test lacks marker (${markers.join(" or ")}): ${relativePath}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const relativeFiles = new Set([
    ...routeLocalAuthCoverage.flatMap((entry) => entry.files.map(([relativePath]) => relativePath)),
    ...proxyOperatorCoverage.map(([relativePath]) => relativePath),
    ...requiredRegressionTests.map(([relativePath]) => relativePath),
  ]);
  const fileTexts = new Map();
  const errors = [];

  for (const relativePath of relativeFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      fileTexts.set(relativePath, read(relativePath));
    } else {
      errors.push(`Expected route-auth file is missing: ${relativePath}`);
    }
  }

  const result = validateRouteAuthBoundary({
    proxyText: fs.readFileSync(proxyPath, "utf8"),
    fileTexts,
  });
  errors.push(...result.errors);

  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log("Route auth boundary OK");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
