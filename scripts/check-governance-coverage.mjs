#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const failures = [];

const governancePath = "docs/governance.md";
if (!exists(governancePath)) {
  failures.push(`${governancePath} is missing`);
} else {
  const doc = read(governancePath);
  const requiredSnippets = [
    "# MemroOS Governance Architecture",
    "Actor -> Action -> Asset -> Purpose -> Label -> Decision -> AuditEvent",
    "## Agentic Stack Coverage",
    "## Policy Decision Contract",
    "## Mandatory Gates",
    "## GitNexus Review Gate",
    "detect_changes(scope=unstaged)",
    "scope=\"staged\"",
    "## Datastrato Decision Rule",
    "## Requirement Gap Matrix",
    "AUDIT-FOLLOWUP-01",
    "ARCH-01",
  ];

  for (const snippet of requiredSnippets) {
    if (!doc.includes(snippet)) failures.push(`${governancePath} missing snippet: ${snippet}`);
  }

  for (const layer of [
    "Goal",
    "Orchestration",
    "Agents",
    "Tools",
    "Memory",
    "Monitoring",
    "Reliability/failure handling",
    "Governance/security",
  ]) {
    if (!doc.includes(`| ${layer} |`)) failures.push(`${governancePath} missing stack layer: ${layer}`);
  }

  for (const decision of ["allow", "deny", "redact", "review-required"]) {
    if (!doc.includes(`| \`${decision}\` |`)) failures.push(`${governancePath} missing decision: ${decision}`);
  }
}

for (const relativePath of [
  "apps/memroos/src/lib/security-policy.ts",
  "apps/memroos/src/lib/memory/policy-gate.ts",
  "apps/memroos/src/lib/vault/writer.ts",
  "apps/memroos/src/lib/vault/envelope.ts",
  "apps/memroos/src/lib/audit/schema.ts",
  "apps/memroos/src/lib/auth/middleware-roles.ts",
  "apps/memroos/src/app/api/admin/compliance/route.ts",
  ".planning/REQUIREMENTS.md",
]) {
  if (!exists(relativePath)) failures.push(`implementation anchor missing: ${relativePath}`);
}

const requirements = read(".planning/REQUIREMENTS.md");
for (const requirement of [
  "MEMSEC-01",
  "MEMSEC-02",
  "MEMSEC-03",
  "MEMSEC-04",
  "MEMSEC-05",
  "MEMSEC-06",
  "MEMSEC-07",
  "MEMSEC-08",
  "CTX-FOLLOWUP-03",
  "NOC-08",
  "ARCH-01",
]) {
  const checked = new RegExp(`\\[x\\]\\s+\\*\\*${requirement}\\*\\*`).test(requirements);
  if (!checked) failures.push(`requirement is not marked verified: ${requirement}`);
}

if (failures.length > 0) {
  console.error("Governance coverage check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Governance coverage check passed.");
