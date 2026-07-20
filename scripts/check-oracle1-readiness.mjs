#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const EXPECTED_OPERATOR_URL = "https://memroos.epiloguecapital.com";

function rel(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function item(id, status, summary, details = {}) {
  return { id, status, summary, ...details };
}

function fileItem(id, relativePath) {
  const present = exists(relativePath);
  return item(
    id,
    present ? "pass" : "fail",
    present ? `${relativePath} exists` : `${relativePath} is missing`,
    { path: relativePath }
  );
}

function textItem(id, relativePath, needle, summary) {
  if (!exists(relativePath)) {
    return item(id, "fail", `${relativePath} is missing`, { path: relativePath, expectedText: needle });
  }
  const present = readText(relativePath).includes(needle);
  return item(
    id,
    present ? "pass" : "fail",
    present ? summary : `${relativePath} does not contain expected readiness marker`,
    { path: relativePath, expectedText: needle }
  );
}

function envItem(name, expectedValue) {
  const value = process.env[name];
  if (!value) {
    return item(
      `env:${name}`,
      "blocked",
      `${name} is not present in this local process environment`,
      {
        env: name,
        reason: "Requires Luis/operator access to oracle-1 /etc/memroos/*.env or an approved secret source.",
      }
    );
  }

  if (expectedValue && value !== expectedValue) {
    return item(
      `env:${name}`,
      "fail",
      `${name} is present but does not match expected operator value`,
      { env: name, expected: expectedValue, actual: value }
    );
  }

  return item(`env:${name}`, "pass", `${name} is present`, {
    env: name,
    expected: expectedValue,
    value: expectedValue ? value : "<set>",
  });
}

function envAnyItem(id, names) {
  const present = names.filter((name) => Boolean(process.env[name]));
  if (present.length > 0) {
    return item(id, "pass", `At least one accepted env var is present: ${present.join(", ")}`, {
      envAnyOf: names,
      present,
    });
  }

  return item(id, "blocked", `None of ${names.join(", ")} are present in this local process environment`, {
    envAnyOf: names,
    reason: "Requires Luis/operator access to oracle-1 production secrets.",
  });
}

function envGroupItem(id, names) {
  const present = names.filter((name) => Boolean(process.env[name]));
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length === 0) {
    return item(id, "pass", `All required env vars are present: ${names.join(", ")}`, {
      envRequired: names,
      present,
    });
  }

  return item(id, "blocked", `Missing local process env vars: ${missing.join(", ")}`, {
    envRequired: names,
    present,
    missing,
    reason: "Requires Luis/operator access to oracle-1 production secrets.",
  });
}

function blockedGate(id, summary) {
  return item(id, "blocked", summary, {
    reason: "Live cutover gate requires Luis/operator credentials and must not be executed by this local checker.",
  });
}

const checks = [
  fileItem("doc:production-deployment", "docs/production-deployment.md"),
  fileItem("doc:oracle1-runbook", "docs/cloud-operator-oracle1-runbook.md"),
  textItem(
    "doc:runbook-local-only",
    "docs/cloud-operator-oracle1-runbook.md",
    "This script only checks local files, local process environment names, and expected repository scripts.",
    "Runbook documents the non-destructive local readiness checker"
  ),
  textItem(
    "doc:runbook-voyage-out-of-scope",
    "docs/cloud-operator-oracle1-runbook.md",
    "Phase 166 / Voyage / `MEMROOS_EMBEDDING_PROVIDER=voyage`",
    "Runbook marks Voyage / Phase 166 out of scope"
  ),
  textItem(
    "roadmap:v8.15-section",
    ".planning/ROADMAP.md",
    "## v8.15 Always-On Cloud Operator",
    "ROADMAP contains the v8.15 cloud operator section"
  ),
  textItem(
    "roadmap:cutover-blocked",
    ".planning/ROADMAP.md",
    "live cutover blocked pending Luis/operator SSH/Tailscale credentials",
    "ROADMAP records that live cutover is blocked pending host access"
  ),
  fileItem("script:verify-onboarding-deploy", "scripts/verify-onboarding-deploy.sh"),
  fileItem("script:install-memory-resilience", "scripts/install-memory-resilience.mjs"),
  fileItem("script:run-graph-catchup", "scripts/run-graph-catchup.mjs"),
  fileItem("script:run-graph-catchup-cron", "scripts/run-graph-catchup-cron.mjs"),
  envItem("MEMROOS_PUBLIC_BASE_URL", EXPECTED_OPERATOR_URL),
  envItem("MEMROOS_APP_URL", EXPECTED_OPERATOR_URL),
  envItem("MEMROOS_EMBEDDING_PROVIDER", "ollama"),
  envAnyItem("env:onboarding-secret", ["MEMROOS_ONBOARDING_SECRET", "MEMROOS_OPERATOR_API_KEY"]),
  envGroupItem("env:qdrant", ["QDRANT_URL", "QDRANT_API_KEY"]),
  envGroupItem("env:neo4j", ["NEO4J_USERNAME", "NEO4J_PASSWORD"]),
  envAnyItem("env:neo4j-endpoint", ["NEO4J_HTTP_URL", "NEO4J_URI"]),
  blockedGate("gate:oracle1-ssh-tailscale", "oracle-1 SSH/Tailscale access is required for host install, systemd, disk/RAM, and Ollama smoke checks"),
  blockedGate("gate:production-secrets", "Production env validation requires access to /etc/memroos/web.env and /etc/memroos/mem0.env"),
  blockedGate("gate:sqlite-cutover", "SQLite migration/sync requires operator-approved source and target paths"),
  blockedGate("gate:cloudflare", "Cloudflare tunnel and DNS changes require operator credentials"),
  blockedGate("gate:heroku-decommission", "Heroku domain removal, dyno scaling, app destruction, or secret rotation require owner credentials"),
  item("scope:voyage", "blocked", "Phase 166 Voyage provider is explicitly out of scope and must not be implemented by this readiness check", {
    phase: 166,
    forbiddenProvider: "voyage",
  }),
];

const counts = checks.reduce(
  (acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  },
  { pass: 0, fail: 0, blocked: 0 }
);

const report = {
  ok: counts.fail === 0,
  readyForLiveCutover: false,
  generatedAt: new Date().toISOString(),
  version: "v8.15-readiness-2026-07-18.1",
  repoRoot: rel(repoRoot),
  scope: {
    includedPhases: [163, 164, 165],
    excludedPhases: [166],
    productionHost: "oracle-1",
    publicUrl: EXPECTED_OPERATOR_URL,
    localOnly: true,
  },
  safety: {
    mutatesProduction: false,
    forbiddenActions: ["ssh", "heroku", "cloudflare", "systemctl", "destroy", "scale", "rotate-secrets"],
  },
  summary: counts,
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
