#!/usr/bin/env node
// LIBNORM-03 (Phase 189) — enforce the `src/lib/` root boundary.
//
// Rule: domain logic lives in `lib/<domain>/`. The `lib/` root holds only
// cross-cutting primitives (env, db, paths, constants, api-error).
//
// Like STORE-03, this gate lands before the file moves: it prevents the root
// from growing while the existing 75 files are relocated. The exception list
// may only shrink.
//
// Exit 0 = boundary held. Exit 1 = a new root-level file, or the count grew.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIB_ROOT_RESERVED,
  LIB_ROOT_EXCEPTIONS,
} from "../apps/memroos/src/lib/lib-boundary-baseline.mjs";

const LIB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "memroos",
  "src",
  "lib",
);

const allowed = new Set([...LIB_ROOT_RESERVED, ...LIB_ROOT_EXCEPTIONS]);

const rootFiles = readdirSync(LIB)
  .filter((e) => !statSync(path.join(LIB, e)).isDirectory())
  .filter((e) => /\.[cm]?tsx?$/.test(e))
  // Baseline modules for the boundary gates themselves are infrastructure,
  // not domain logic, and are excluded by name.
  .filter((e) => e !== "sqlite-allowlist.mjs" && e !== "lib-boundary-baseline.mjs")
  .sort();

const violations = rootFiles.filter((f) => !allowed.has(f));
const stale = LIB_ROOT_EXCEPTIONS.filter((f) => !rootFiles.includes(f));

if (violations.length > 0) {
  console.error(
    `\n✗ LIBNORM-03: ${violations.length} new file(s) at the src/lib/ root:\n`,
  );
  for (const v of violations) console.error(`    ${v}`);
  console.error(
    `\n  Domain logic belongs in src/lib/<domain>/. Only cross-cutting
  primitives (${LIB_ROOT_RESERVED.join(", ")}) live at the root.
  The exception list is a shrinking baseline — do not add to it.\n`,
  );
  process.exit(1);
}

const current = rootFiles.filter((f) => !LIB_ROOT_RESERVED.includes(f)).length;
if (current > LIB_ROOT_EXCEPTIONS.length) {
  console.error(
    `\n✗ LIBNORM-03: root-level domain files grew from ${LIB_ROOT_EXCEPTIONS.length} to ${current}.\n`,
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.log(
    `ℹ LIBNORM-03: ${stale.length} exception entr${stale.length === 1 ? "y is" : "ies are"} no longer at the root — remove from src/lib/lib-boundary-baseline.mjs:`,
  );
  for (const s of stale) console.log(`    ${s}`);
}

const moved = LIB_ROOT_EXCEPTIONS.length - current;
console.log(
  `✓ LIBNORM-03: ${current} root-level domain file(s) remain (baseline ${LIB_ROOT_EXCEPTIONS.length}${moved > 0 ? `, ${moved} relocated` : ""}).`,
);
