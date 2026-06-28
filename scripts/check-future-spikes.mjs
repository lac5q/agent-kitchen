#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const SPIKE_REPORTS = [
  {
    requirement: "MEMGEN-FOLLOWUP-02",
    path: ".planning/spikes/2026-06-27-memento-memory-save-quality.md",
    requiredPhrases: ["agent_memory_candidates", "No dependency adoption", "No backend swap"],
  },
  {
    requirement: "COCOINDEX-FOLLOWUP-01",
    path: ".planning/spikes/2026-06-27-cocoindex-source-freshness.md",
    requiredPhrases: ["context-sources.config.json", "No production index path", "No policy bypass"],
  },
  {
    requirement: "FASTCONTEXT-FOLLOWUP-01",
    path: ".planning/spikes/2026-06-27-fastcontext-repo-scout.md",
    requiredPhrases: ["GitNexus", "No hosted or private repo upload", "No automatic code edits"],
  },
  {
    requirement: "ADKA2A-FOLLOWUP-01",
    path: ".planning/spikes/2026-06-27-adk-a2a-contract-compliance.md",
    requiredPhrases: ["memroos-a2a.v1", "No ADK/Gemini core dependency", "Fail closed"],
  },
  {
    requirement: "QDRANT-FOLLOWUP-01",
    path: ".planning/spikes/2026-06-27-qdrant-cloud-upgrade-readiness.md",
    requiredPhrases: ["QDRANT_URL", "No local Qdrant container", "No production cluster upgrade"],
  },
  {
    requirement: "HYPEREXTRACT-FOLLOWUP-01",
    path: ".planning/spikes/2026-06-27-hyperextract-structured-memory.md",
    requiredPhrases: ["source-span-backed", "No private-document upload", "No storage-layer replacement"],
  },
];

const REQUIRED_SECTIONS = [
  "## External Signal",
  "## Repo Baseline",
  "## Comparison Result",
  "## Decision",
  "## Guardrails",
  "## Verification",
];

export function validateSpikeReport(report, text) {
  const errors = [];
  if (!text.includes(`Requirement: \`${report.requirement}\``)) {
    errors.push(`${report.path}: missing requirement marker ${report.requirement}`);
  }
  if (!text.includes("Status: completed bounded spike")) {
    errors.push(`${report.path}: missing completed bounded spike status`);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!text.includes(section)) errors.push(`${report.path}: missing section ${section}`);
  }
  for (const phrase of report.requiredPhrases) {
    if (!text.includes(phrase)) errors.push(`${report.path}: missing required phrase ${phrase}`);
  }
  return errors;
}

export function validateFutureSpikes(files) {
  const errors = [];
  for (const report of SPIKE_REPORTS) {
    const text = files.get(report.path);
    if (text === undefined) {
      errors.push(`Missing future spike report: ${report.path}`);
      continue;
    }
    errors.push(...validateSpikeReport(report, text));
  }
  return { ok: errors.length === 0, errors };
}

function main() {
  const files = new Map();
  for (const report of SPIKE_REPORTS) {
    const absolutePath = path.join(repoRoot, report.path);
    if (fs.existsSync(absolutePath)) {
      files.set(report.path, fs.readFileSync(absolutePath, "utf8"));
    }
  }
  const result = validateFutureSpikes(files);
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    process.exit(1);
  }
  console.log(`Future spikes OK (${SPIKE_REPORTS.length} reports)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
