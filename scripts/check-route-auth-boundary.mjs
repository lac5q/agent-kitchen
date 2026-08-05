#!/usr/bin/env node
// Auth-boundary gate — Phase 187 (AUTHGATE-01..03).
//
// Pre-Phase 187: this script held a hardcoded `routeLocalAuthCoverage` array
// listing every file the check should verify. Adding a new route handler
// (route.ts / route.tsx / route.js / route.jsx / route.mjs / route.mts)
// under an exempt prefix (e.g. /api/gsd/anything) was silently allowed
// because the file was never enumerated. Architecture review F3
// (2026-07-24) flagged this as the most likely CI-evading failure mode.
//
// Phase 187 rewrites the gate to enumerate the filesystem for every prefix
// pattern in proxy.ts:ROUTE_LOCAL_AUTH_API_ROUTES and require an auth marker
// on every matching route handler. Public-metadata exceptions move to an
// explicit allowlist with a stated reason.
//
// The script preserves the original bidirectional pattern ↔ coverage check
// so that removing a pattern from proxy.ts or removing a coverage entry
// still fails CI.
//
// Note: a "namespace-closure" check (asserting that no route handler
// exists outside both the proxy's default-deny path and the coverage
// list) is NOT implemented in this phase. The proxy's default-deny
// catch-all already covers every non-exempt route, so adding a route
// under a new prefix fails closed at runtime. The filesystem walk
// implemented here only covers the exempt prefixes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const proxyPath = path.join(repoRoot, "apps/memroos/src/proxy.ts");
const apiRoot = path.join(repoRoot, "apps/memroos/src/app/api");

// ---------- Coverage source-of-truth (AUTHGATE-01) ----------
//
// Each entry maps a proxy pattern to:
//   - the files the check expects to find (filesystem-derived at runtime;
//     the `files` array is informational and used to drive the marker
//     assertion).
//   - the auth markers that satisfy coverage. A file containing ANY of
//     these markers is considered auth'd.
//   - `publicMetadataAllowlist`: route.ts files under the pattern's glob
//     path that are explicitly public (e.g. OpenAPI metadata routes).
//     These files are required to exist on disk and to be present in the
//     coverage list, but are exempt from the marker check. Each entry
//     carries a stated reason.
//   - `markersRequired`: when true (default), every matched file must
//     contain at least one marker. Set to false for purely-public prefix
//     patterns (none in this repo; reserved for future use).

const routeLocalAuthCoverage = [
  {
    pattern: "/^\\/api\\/onboarding\\/script$/",
    files: [["apps/memroos/src/app/api/onboarding/script/route.ts", ["verifyAgentOnboardingToken("]]],
  },
  {
    pattern: "/^\\/api\\/onboarding\\/register$/",
    files: [["apps/memroos/src/app/api/onboarding/register/route.ts", ["verifyAgentOnboardingToken("]]],
  },
  {
    pattern: "/^\\/api\\/agent-report$/",
    files: [["apps/memroos/src/app/api/agent-report/route.ts", ["authenticateAgentHeaders(", "resolveAccessToken(", "authenticateUser("]]],
  },
  {
    pattern: "/^\\/api\\/chatgpt\\/actions\\//",
    files: [
      ["apps/memroos/src/app/api/chatgpt/actions/search/route.ts", ["authorizeChatGptAction("]],
      ["apps/memroos/src/app/api/chatgpt/actions/fetch/route.ts", ["authorizeChatGptAction("]],
      ["apps/memroos/src/app/api/chatgpt/actions/save/route.ts", ["authorizeChatGptAction("]],
    ],
    publicMetadataAllowlist: [
      {
        path: "apps/memroos/src/app/api/chatgpt/actions/openapi/route.ts",
        reason: "Public OpenAPI metadata route (no auth by design; surfaces the action catalog for ChatGPT discovery).",
      },
    ],
  },
  {
    pattern: "/^\\/api\\/agent-context(?:\\/|$)/",
    files: [
      ["apps/memroos/src/app/api/agent-context/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/ack/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/agent-context/messages/[id]/reply/route.ts", ["authenticateAgentHeaders("]],
    ],
  },
  {
    pattern: "/^\\/api\\/gsd(?:\\/|$)/",
    files: [
      ["apps/memroos/src/app/api/gsd/goal/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/resume/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/shipcheck/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/standup/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/discuss/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/skill-audit/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/skill-boundary/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/lane-eval/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/model-route/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/gsd/adapter/route.ts", ["authenticateAgentHeaders("]],
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
    files: [["apps/memroos/src/app/api/agents/register/route.ts", ["authorizeRegistryWriteStrict("]]],
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
    pattern: "/^\\/api\\/memory\\/health$/",
    files: [["apps/memroos/src/app/api/memory/health/route.ts", ["authenticateAgentHeaders(", "authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/memory\\/search$/",
    files: [["apps/memroos/src/app/api/memory/search/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/memory\\/evals\\//",
    files: [
      ["apps/memroos/src/app/api/memory/evals/latest/route.ts", ["authorizeRegistryWrite("]],
      ["apps/memroos/src/app/api/memory/evals/run/route.ts", ["authorizeRegistryWrite("]],
    ],
  },
  {
    pattern: "/^\\/api\\/recall$/",
    files: [["apps/memroos/src/app/api/recall/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/recall\\/ingest$/",
    files: [["apps/memroos/src/app/api/recall/ingest/route.ts", ["authorizeRegistryWrite("]]],
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
    pattern: "/^\\/api\\/operations\\/telemetry$/",
    files: [["apps/memroos/src/app/api/operations/telemetry/route.ts", ["authenticateAgentHeaders(", "authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/tool-attention\\/record$/",
    files: [["apps/memroos/src/app/api/tool-attention/record/route.ts", ["authenticateAgentHeaders("]]],
  },
  {
    pattern: "/^\\/api\\/audit\\/knowledge$/",
    files: [["apps/memroos/src/app/api/audit/knowledge/route.ts", ["verifyAgentApiKey(", "authenticateAgentKey("]]],
  },
  {
    pattern: "/^\\/api\\/internal\\/connector-search$/",
    files: [["apps/memroos/src/app/api/internal/connector-search/route.ts", ["authorizeRegistryWrite("]]],
  },
  {
    pattern: "/^\\/api\\/connmem(?:\\/|$)/",
    files: [
      ["apps/memroos/src/app/api/connmem/status/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/connmem/sync/[source]/route.ts", ["authenticateAgentHeaders("]],
      ["apps/memroos/src/app/api/connmem/ledger/route.ts", ["authenticateAgentHeaders("]],
    ],
  },
  {
    pattern: "/^\\/api\\/model-routing\\/telemetry$/",
    files: [["apps/memroos/src/app/api/model-routing/telemetry/route.ts", ["authorizeRegistryWrite("]]],
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
  ["apps/memroos/src/app/api/gsd/__tests__/route.test.ts", ["requires authenticated agent keys"]],
  ["apps/memroos/src/app/api/gsd/__tests__/extended-route.test.ts", ["requires authenticated agent keys"]],
  ["apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/hive/__tests__/route.test.ts", ["blocks direct non-local"]],
  ["apps/memroos/src/app/api/model-routing/__tests__/route.test.ts", ["blocks direct non-local"]],
];

// ---------- Proxy parsing (regex → path prefix) ----------
//
// Convert the proxy's RegExp patterns to a filesystem glob path under
// apps/memroos/src/app/api. The conversion handles the three shapes
// observed in the proxy:
//
//   /^\\/api\\/foo$/                  → exact file: apps/memroos/src/app/api/foo/route.ts
//   /^\\/api\\/foo\\//                → prefix dir: apps/memroos/src/app/api/foo/**/route.ts
//   /^\\/api\\/foo(?:\\/|$)/          → prefix or exact: apps/memroos/src/app/api/foo/**/route.ts
//
// The same function is used by the test fixture (proxy text is passed in
// as a string). The function is exported so the test can drive it.

export function parseRouteLocalAuthPatterns(proxyText) {
  const match = proxyText.match(/const ROUTE_LOCAL_AUTH_API_ROUTES[\s\S]*?\n\];/);
  if (!match) return [];
  return match[0]
    .split("\n")
    .map((line) => line.match(/pattern:\s*([^,\s}]+)/)?.[1])
    .filter((pattern) => pattern?.startsWith("/"));
}

export function patternToGlob(pattern, customApiRoot) {
  // pattern is the regex-literal source as a JS string, e.g.
  //   "/^\\/api\\/gsd(?:\\/|$)/"
  // which materializes to:
  //   /^\/api\/gsd(?:\/|$)/
  // Distinguish three shapes so we walk the filesystem with the right
  // semantics:
  //   - exact:   /^\/api\/foo$/                  → check api/foo/route.ts only
  //   - prefix:  /^\/api\/foo\//                 → walk api/foo/**/route.ts
  //   - either:  /^\/api\/foo(?:\/|$)/           → walk api/foo/**/route.ts
  //             (matches the exact file AND the directory tree)
  const isExact = /\$\/$/.test(pattern);
  const isPrefixOrExact = /\)\/$/.test(pattern);
  // The regex source for a prefix pattern ends with the escaped slash
  // followed by the closing delimiter, e.g. /^\/api\/foo\//  — that
  // materializes to a string whose last two characters are `\/` and `/`.
  // The check below matches `\//` (two chars) at the end of the string.
  const isPrefix = /\\\/\/$/.test(pattern);

  // Step 1: strip the regex literal delimiters (leading / and trailing /).
  let body = pattern.replace(/^\/|\/$/g, "");
  // Step 2: strip the anchors.
  body = body.replace(/^\^/, "").replace(/\$$/, "");
  // Step 3: undo the regex escapes for forward slashes.
  body = body.replace(/\\\//g, "/");
  // Step 4: strip the known shape suffixes.
  if (body.endsWith("(?:/|$)")) {
    body = body.slice(0, -7); // length of "(?:/|$)"
  }
  if (body.endsWith("/")) {
    body = body.slice(0, -1);
  }
  // Step 5: body is now "/api/foo" — translate to filesystem path under
  // apiRoot (or the caller's custom apiRoot in test mode).
  const apiPath = body.replace(/^\/api\//, "");
  const root = path.join(customApiRoot ?? apiRoot, apiPath);

  if (isExact && !isPrefixOrExact) {
    return { mode: "exact", root, filePath: path.join(root, "route.ts") };
  }
  return { mode: isPrefix || isPrefixOrExact ? "prefix" : "exact", root };
}

export function enumerateExactFilePaths(root) {
  // For an exact-match pattern, the route file may be any of the
  // Next.js App Router route handler extensions. Return every existing
  // match so the caller can verify marker coverage on the file that
  // actually exists on disk.
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && ROUTE_FILE_RE.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

function hasAnyMarker(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

// ---------- Filesystem enumeration (AUTHGATE-01) ----------
//
// Walk the filesystem from the glob path and return every route.ts file.
// Uses a simple recursive walk — no third-party glob dependency.

// Next.js App Router files other than `route.ts`: `route.tsx`, `route.js`,
// `route.jsx`, `route.mjs`, `route.mts`. Each is its own route handler
// and must carry an auth marker when under an exempt prefix. The
// validator (Opus 4.8) caught the original implementation as a real
// CI-evading hole: a `route.tsx` under an exempt prefix was silently
// allowed. See scripts/check-route-auth-boundary.test.mjs
// "catches a fixture under .tsx" for the regression test.
export const ROUTE_FILE_RE = /^route\.(ts|tsx|js|jsx|mjs|mts)$/;

export function walkRouteFiles(absRoot) {
  const results = [];
  if (!fs.existsSync(absRoot)) return results;
  const entries = fs.readdirSync(absRoot, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(absRoot, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRouteFiles(abs));
    } else if (entry.isFile() && ROUTE_FILE_RE.test(entry.name)) {
      results.push(abs);
    }
  }
  return results;
}

// ---------- Validation ----------

export function validateRouteAuthBoundary({ proxyText, fileTexts, filesystemRouteFiles, repoRoot: customRepoRoot, apiRoot: customApiRoot }) {
  const errors = [];
  // When the caller passes a custom repoRoot/apiRoot (test mode), all
  // path resolution and filesystem enumeration root from those. The
  // default is the production layout computed from the script's location.
  const effectiveRepoRoot = customRepoRoot ?? repoRoot;
  const effectiveApiRoot = customApiRoot ?? apiRoot;
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

  // AUTHGATE-01: enumerate the filesystem for every prefix pattern. Every
  // matched route.ts must (a) be in the explicit coverage list (so a renamer
  // catches it) AND (b) carry an auth marker unless it is in the public-
  // metadata allowlist for that pattern.
  //
  // `filesystemRouteFiles` controls enumeration:
  //   - true: walk the real filesystem rooted at `effectiveApiRoot`
  //   - array of relative paths: use the array as the enumeration (test mode)
  //   - false/undefined: skip enumeration (legacy mode, used by some unit tests)
  if (filesystemRouteFiles) {
    const coveredFileSet = new Set();
    for (const entry of routeLocalAuthCoverage) {
      for (const [relativePath] of entry.files) coveredFileSet.add(relativePath);
      for (const allow of entry.publicMetadataAllowlist ?? []) coveredFileSet.add(allow.path);
    }
    const publicMetadataByFile = new Map();
    for (const entry of routeLocalAuthCoverage) {
      for (const allow of entry.publicMetadataAllowlist ?? []) {
        publicMetadataByFile.set(allow.path, allow.reason);
      }
    }

    const enumerated = Array.isArray(filesystemRouteFiles)
      ? filesystemRouteFiles
      : (() => {
          const set = new Set();
          for (const pattern of routeLocalPatterns) {
            const glob = patternToGlob(pattern, effectiveApiRoot);
            if (glob.mode === "exact") {
              // The exact path may have any App Router extension
              // (route.ts, route.tsx, route.js, ...). Enumerate all
              // existing files so non-`.ts` handlers are also covered.
              for (const abs of enumerateExactFilePaths(glob.root)) {
                set.add(path.relative(effectiveRepoRoot, abs));
              }
              continue;
            }
            for (const abs of walkRouteFiles(glob.root)) {
              set.add(path.relative(effectiveRepoRoot, abs));
            }
          }
          return [...set];
        })();

    for (const relativePath of enumerated) {
      const isAllowlisted = publicMetadataByFile.has(relativePath);
      const inCoverage = coveredFileSet.has(relativePath);
      if (!inCoverage && !isAllowlisted) {
        errors.push(
          `Route under exempt prefix lacks coverage entry: ${relativePath}. Add a coverage entry to scripts/check-route-auth-boundary.mjs, or add it to the public-metadata allowlist with a stated reason.`,
        );
        continue;
      }
      if (isAllowlisted) continue;
      const text = fileTexts.get(relativePath) ?? "";
      const markers = markersForFile(relativePath);
      if (!hasAnyMarker(text, markers)) {
        errors.push(
          `Enumerated route lacks handler-local auth marker (${markers.join(" or ")}): ${relativePath}`,
        );
      }
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

function markersForFile(relativePath) {
  for (const entry of routeLocalAuthCoverage) {
    for (const [file, markers] of entry.files) {
      if (file === relativePath) return markers;
    }
  }
  return [];
}

function main() {
  const relativeFiles = new Set([
    ...routeLocalAuthCoverage.flatMap((entry) => entry.files.map(([relativePath]) => relativePath)),
    ...routeLocalAuthCoverage.flatMap((entry) => (entry.publicMetadataAllowlist ?? []).map((allow) => allow.path)),
    ...proxyOperatorCoverage.map(([relativePath]) => relativePath),
    ...requiredRegressionTests.map(([relativePath]) => relativePath),
  ]);
  const fileTexts = new Map();
  const errors = [];

  for (const relativePath of relativeFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      fileTexts.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
    } else {
      errors.push(`Expected route-auth file is missing: ${relativePath}`);
    }
  }

  const result = validateRouteAuthBoundary({
    proxyText: fs.readFileSync(proxyPath, "utf8"),
    fileTexts,
    filesystemRouteFiles: true,
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
