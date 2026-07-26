#!/usr/bin/env node
// STORE-03 (Phase 188) — enforce the better-sqlite3 confinement boundary.
//
// Rule: `better-sqlite3` may only be imported from `src/lib/store/**` or from
// test files. Every other importer must appear on the baseline allowlist in
// `src/lib/sqlite-allowlist.mjs`, which may only shrink.
//
// This lands before the migration itself, on purpose: it stops new ungoverned
// data access from being added while the existing 117 files are worked through.
//
// Exit 0 = boundary held. Exit 1 = a new violation, or the count grew.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SQLITE_DIRECT_IMPORT_ALLOWLIST,
  SQLITE_ALLOWLIST_BASELINE,
} from "../apps/memroos/src/lib/sqlite-allowlist.mjs";

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "memroos",
);
const SRC = path.join(APP_ROOT, "src");
const STORE_PREFIX = path.join("src", "lib", "store") + path.sep;

const isTestFile = (rel) =>
  rel.includes(`${path.sep}__tests__${path.sep}`) ||
  /\.test\.[cm]?[jt]sx?$/.test(rel);

const isStoreFile = (rel) => rel.startsWith(STORE_PREFIX);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.[cm]?[jt]sx?$/.test(entry)) out.push(full);
  }
  return out;
}

// Match a real import/require of the module, not a mention in a comment or a
// longer specifier like "better-sqlite3-session-store".
const IMPORT_RE = /(?:from\s*|require\(\s*)["']better-sqlite3["']/;

const allowed = new Set(SQLITE_DIRECT_IMPORT_ALLOWLIST);
const violations = [];
const found = [];

for (const file of walk(SRC)) {
  const rel = path.relative(APP_ROOT, file);
  if (isTestFile(rel) || isStoreFile(rel)) continue;
  if (!IMPORT_RE.test(readFileSync(file, "utf8"))) continue;
  found.push(rel);
  if (!allowed.has(rel)) violations.push(rel);
}

const stale = SQLITE_DIRECT_IMPORT_ALLOWLIST.filter((p) => !found.includes(p));

if (violations.length > 0) {
  console.error(
    `\n✗ STORE-03: ${violations.length} file(s) import better-sqlite3 outside src/lib/store/** and are not on the allowlist:\n`,
  );
  for (const v of violations) console.error(`    ${v}`);
  console.error(
    `\n  Put the data access in src/lib/store/** instead. The allowlist is a
  shrinking baseline for the pre-existing files — do not add to it.\n`,
  );
  process.exit(1);
}

if (found.length > SQLITE_ALLOWLIST_BASELINE) {
  console.error(
    `\n✗ STORE-03: direct better-sqlite3 importers grew from ${SQLITE_ALLOWLIST_BASELINE} to ${found.length}.\n`,
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.log(
    `ℹ STORE-03: ${stale.length} allowlist entr${stale.length === 1 ? "y no longer imports" : "ies no longer import"} better-sqlite3 — remove from src/lib/sqlite-allowlist.mjs:`,
  );
  for (const s of stale) console.log(`    ${s}`);
}

const migrated = SQLITE_ALLOWLIST_BASELINE - found.length;
console.log(
  `✓ STORE-03: ${found.length} direct importer(s) remain (baseline ${SQLITE_ALLOWLIST_BASELINE}${migrated > 0 ? `, ${migrated} migrated` : ""}).`,
);
