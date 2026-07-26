#!/usr/bin/env node
// Regression tests for the STORE-03 gate. A gate that has never been seen to
// fail is not known to work — these prove it fails on a real violation.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = path.join(ROOT, "scripts", "check-sqlite-allowlist.mjs");
const FIXTURE_DIR = path.join(ROOT, "apps", "memroos", "src", "lib", "__store03_fixture__");

function runGate() {
  try {
    return { code: 0, out: execFileSync("node", [GATE], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("passes on a clean tree", () => {
  const { code } = runGate();
  assert.equal(code, 0, "gate should pass with no fixture present");
});

test("fails when a new file imports better-sqlite3 outside lib/store", () => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(
    path.join(FIXTURE_DIR, "ungoverned.ts"),
    'import Database from "better-sqlite3";\nexport const db = Database;\n',
  );
  try {
    const { code, out } = runGate();
    assert.equal(code, 1, "gate must fail on an unlisted direct importer");
    assert.match(out, /ungoverned\.ts/);
  } finally {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
});

test("allows the same import from inside lib/store", () => {
  const storeFixture = path.join(ROOT, "apps", "memroos", "src", "lib", "store", "__store03_fixture__");
  mkdirSync(storeFixture, { recursive: true });
  writeFileSync(
    path.join(storeFixture, "governed.ts"),
    'import Database from "better-sqlite3";\nexport const db = Database;\n',
  );
  try {
    const { code } = runGate();
    assert.equal(code, 0, "lib/store/** is the sanctioned home for direct access");
  } finally {
    rmSync(path.join(ROOT, "apps", "memroos", "src", "lib", "store"), { recursive: true, force: true });
  }
});

test("ignores test files", () => {
  mkdirSync(path.join(FIXTURE_DIR, "__tests__"), { recursive: true });
  writeFileSync(
    path.join(FIXTURE_DIR, "__tests__", "fixture.test.ts"),
    'import Database from "better-sqlite3";\nexport const db = Database;\n',
  );
  try {
    const { code } = runGate();
    assert.equal(code, 0, "test files may open fixture DBs directly");
  } finally {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
});
