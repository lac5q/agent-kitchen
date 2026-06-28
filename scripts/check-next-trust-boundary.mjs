#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const checklistPath = path.join(repoRoot, "docs/next-trust-boundary-upgrade.md");
const proxyPath = path.join(repoRoot, "apps/memroos/src/proxy.ts");
const middlewarePath = path.join(repoRoot, "apps/memroos/src/middleware.ts");
const packagePath = path.join(repoRoot, "apps/memroos/package.json");

const REQUIRED_REGRESSION_TESTS = [
  "apps/memroos/src/__tests__/proxy.test.ts",
  "apps/memroos/src/app/api/agent-checkpoints/__tests__/route.test.ts",
  "apps/memroos/src/app/api/agent-memory/traces/__tests__/route.test.ts",
  "apps/memroos/src/app/api/agent-runtime/observability/__tests__/route.test.ts",
  "apps/memroos/src/app/api/agents/versions/__tests__/route.test.ts",
  "apps/memroos/src/app/api/hive/__tests__/route.test.ts",
  "apps/memroos/src/app/api/model-routing/__tests__/route.test.ts",
];

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function parseTrustBoundaryChecklist(text) {
  return {
    nextDependency: text.match(/Reviewed Next\.js dependency:\s*`([^`]+)`/)?.[1] ?? null,
    proxySha256: text.match(/Reviewed proxy sha256:\s*`([^`]+)`/)?.[1] ?? null,
  };
}

function listTrackedLikeFiles() {
  const files = new Set();
  for (const root of ["apps/memroos/src", "docs", "scripts"]) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    const stack = [absoluteRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolute);
        } else {
          files.add(path.relative(repoRoot, absolute).split(path.sep).join("/"));
        }
      }
    }
  }
  return files;
}

export function validateNextTrustBoundary({
  nextDependency,
  checklistText,
  proxyText,
  proxySha256,
  proxyTestText = "",
  middlewareExists,
  files,
}) {
  const errors = [];
  const warnings = [];
  const checklist = parseTrustBoundaryChecklist(checklistText);

  if (checklist.nextDependency !== nextDependency) {
    errors.push(
      `Next dependency changed without refreshing checklist: package=${nextDependency}, checklist=${checklist.nextDependency}`
    );
  }
  if (checklist.proxySha256 !== proxySha256) {
    errors.push(
      `proxy sha256 changed without refreshing checklist: current=${proxySha256}, checklist=${checklist.proxySha256}`
    );
  }
  if (middlewareExists) {
    errors.push("apps/memroos/src/middleware.ts exists; Next 16 trust boundary should stay in proxy.ts");
  }
  if (!/export\s+async\s+function\s+proxy|export\s+function\s+proxy/.test(proxyText)) {
    errors.push("proxy.ts must export a named proxy function");
  }
  if (!/export\s+const\s+config/.test(proxyText) || !/matcher\s*:/.test(proxyText)) {
    errors.push("proxy.ts must export matcher config");
  }
  if (/runtime\s*:/.test(proxyText)) {
    errors.push("proxy.ts must not configure runtime; Next 16 proxy runtime is Node.js");
  }

  for (const requiredPath of REQUIRED_REGRESSION_TESTS) {
    if (!files.has(requiredPath)) errors.push(`Missing trust-boundary regression test: ${requiredPath}`);
  }

  if (!checklistText.includes("unstable_doesProxyMatch")) {
    errors.push("Checklist must require matcher regression coverage with unstable_doesProxyMatch");
  }
  if (!checklistText.includes("npm run check:next-trust-boundary")) {
    errors.push("Checklist must include npm run check:next-trust-boundary");
  }

  const requiredProxyRegressionMarkers = [
    "expired or malformed JWT",
    "reviewer role escalation",
    "path traversal",
    "Bearer token takes precedence",
  ];
  for (const marker of requiredProxyRegressionMarkers) {
    if (!proxyTestText.includes(marker)) {
      errors.push(`Proxy regression tests must cover: ${marker}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function main() {
  const appPackage = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const proxyText = fs.readFileSync(proxyPath, "utf8");
  const checklistText = fs.readFileSync(checklistPath, "utf8");
  const proxyTestText = fs.readFileSync(
    path.join(repoRoot, "apps/memroos/src/__tests__/proxy.test.ts"),
    "utf8"
  );
  const result = validateNextTrustBoundary({
    nextDependency: appPackage.dependencies?.next,
    checklistText,
    proxyText,
    proxySha256: sha256(proxyText),
    proxyTestText,
    middlewareExists: fs.existsSync(middlewarePath),
    files: listTrackedLikeFiles(),
  });

  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  for (const warning of result.warnings) console.warn(warning);
  console.log("Next trust boundary OK");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
