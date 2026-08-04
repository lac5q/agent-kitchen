#!/usr/bin/env node
// PHASE-210B-1 — shrinking ratchet for non-test TypeScript references to
// `requireRole` or `ROLE_RANK`.
//
// Rule: no new non-test TypeScript references may be added under
// `apps/memroos/src/**` while the route migration is in flight.
//
// The pre-migration inventory was 74 reference lines. Phase 210b removes four
// explicit one-call routes (8 reference lines total) and the old rank
// comparison inside the derived facade (1 reference line), so the live ratchet
// baseline is 65. This gate counts every non-test source line containing a
// word-boundary reference in `.ts` / `.tsx` files, including imports,
// definitions, and comments. A line with both symbols is one callsite line,
// matching the verified pre-migration inventory.
//
// Exit 0 = current count is at or below the baseline.
// Exit 1 = the count grew above the baseline.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "memroos", "src");
const PRE_MIGRATION_COUNT = 74;
const LIVE_BASELINE = 65;
const TEST_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];
const REFERENCE_RE = /\b(requireRole|ROLE_RANK)\b/;

function isCountedFile(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized.includes("/__tests__/")) return false;
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".tsx")) return false;
  return !TEST_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    const rel = path.relative(REPO_ROOT, full);
    if (isCountedFile(rel)) files.push(full);
  }
  return files;
}

function scan(rootDir = SRC_ROOT) {
  const perFile = [];
  let total = 0;

  for (const file of walk(rootDir)) {
    const rel = path.relative(REPO_ROOT, file);
    const count = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => REFERENCE_RE.test(line)).length;
    if (count === 0) continue;
    perFile.push({ rel, count });
    total += count;
  }

  perFile.sort((a, b) => a.rel.localeCompare(b.rel));
  return { total, perFile };
}

function main() {
  const { total, perFile } = scan();

  if (total > LIVE_BASELINE) {
    console.error(
      `\n✗ PHASE-210B-1: non-test TypeScript role-rank reference lines are ${total}, above the live baseline ${LIVE_BASELINE}.`,
    );
    console.error(
      `  Ratchet: ${PRE_MIGRATION_COUNT} -> ${LIVE_BASELINE} after four route migrations plus the derived-facade rank removal.\n`,
    );
    for (const { rel, count } of perFile) console.error(`    ${rel}: ${count}`);
    process.exit(1);
  }

  const migrated = PRE_MIGRATION_COUNT - total;
  console.log(
    `✓ PHASE-210B-1: ${total} non-test TypeScript role-rank reference line(s); baseline ${LIVE_BASELINE}.`,
  );
  console.log(
    `  Ratchet target: ${PRE_MIGRATION_COUNT} -> ${LIVE_BASELINE}${migrated > 0 ? ` (${migrated} reference(s) removed from the pre-migration inventory)` : ""}.`,
  );
}

main();
