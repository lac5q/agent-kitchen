#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const requirementsPath = path.join(repoRoot, ".planning/REQUIREMENTS.md");
const prioritizationPath = path.join(repoRoot, ".planning/notes/2026-06-19-gsd-roadmap-prioritization.md");

const STEP_PREFIXES = ["ARCHREV", "EFFTEL"];
const SPIKE_PREFIXES = ["MEMGEN-FOLLOWUP", "COCOINDEX-FOLLOWUP", "FASTCONTEXT-FOLLOWUP", "ADKA2A-FOLLOWUP"];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractRequirements(markdown, prefixes) {
  const pattern = /^- (\[[ xX]\] )?\*\*([A-Z0-9-]+-\d+)\*\*: (.*)$/gm;
  const requirements = [];
  for (const match of markdown.matchAll(pattern)) {
    const id = match[2];
    if (!prefixes.some((prefix) => id.startsWith(prefix))) continue;
    requirements.push({
      id,
      checked: Boolean(match[1]?.toLowerCase().includes("[x]")),
      text: match[3].trim(),
    });
  }
  return requirements;
}

function extractRankedPlan(markdown) {
  const pattern = /^\d+\. \*\*(.+?)\*\*/gm;
  return [...markdown.matchAll(pattern)].map((match) => match[1]);
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

const requirements = read(requirementsPath);
const prioritization = read(prioritizationPath);
const active = extractRequirements(requirements, STEP_PREFIXES);
const spikes = extractRequirements(requirements, SPIKE_PREFIXES);
const rankedPlan = extractRankedPlan(prioritization);

const incompleteActive = active.filter((requirement) => !requirement.checked);
const approvedSpikes = spikes.filter((requirement) => requirement.checked || /\bapproved\b/i.test(requirement.text));

const expectedOrder = [
  "Phase 115 trust-boundary hardening",
  "Phase 115 runtime and config hardening",
  "Public evidence refresh",
  "Phase 117 NOC efficiency telemetry",
  "Bounded research spikes",
];

expectedOrder.forEach((expected, index) => {
  if (!rankedPlan[index]?.startsWith(expected)) {
    fail(`Ranked roadmap item ${index + 1} must remain "${expected}" before spike work is promoted.`);
  }
});

if (incompleteActive.length > 0 && approvedSpikes.length > 0) {
  fail(
    `Spike requirements cannot be approved while active steps remain incomplete. Incomplete: ${incompleteActive
      .map((requirement) => requirement.id)
      .join(", ")}; approved spikes: ${approvedSpikes.map((requirement) => requirement.id).join(", ")}.`,
  );
}

if (!/Spike-first:/m.test(prioritization)) {
  fail("Roadmap prioritization note must keep a Spike-first section documenting deferred spike gates.");
}

if (process.exitCode) {
  process.exit();
}

console.log(`✓ Roadmap priority gate passed: ${incompleteActive.length} active step(s) remain before spikes.`);
console.log(`✓ Deferred spike count: ${spikes.length}; approved before completion: ${approvedSpikes.length}.`);
