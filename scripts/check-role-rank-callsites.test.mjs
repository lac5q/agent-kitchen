#!/usr/bin/env node
// Regression tests for the PHASE-210B-1 ratchet gate.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = path.join(ROOT, "scripts", "check-role-rank-callsites.mjs");
const FIXTURE_DIR = path.join(ROOT, "apps", "memroos", "src", "lib", "__phase210b1_fixture__");

function runGate() {
  try {
    return {
      code: 0,
      out: execFileSync("node", [GATE], {
        cwd: ROOT,
        encoding: "utf8",
      }),
    };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

test("passes on a clean tree", () => {
  const { code, out } = runGate();
  assert.equal(code, 0, "gate should pass with no fixture present");
  assert.match(out, /baseline/);
});

test("fails when a new TypeScript file adds requireRole", () => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(
    path.join(FIXTURE_DIR, "new-require-role.ts"),
    'export const marker = "requireRole";\n',
  );
  try {
    const { code, out } = runGate();
    assert.equal(code, 1, "gate must fail on a new requireRole token reference");
    assert.match(out, /new-require-role\.ts: 1/);
  } finally {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
});

test("fails when a new TypeScript file adds ROLE_RANK", () => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(
    path.join(FIXTURE_DIR, "new-role-rank.ts"),
    "export const marker = 'ROLE_RANK';\n",
  );
  try {
    const { code, out } = runGate();
    assert.equal(code, 1, "gate must fail on a new ROLE_RANK token reference");
    assert.match(out, /new-role-rank\.ts: 1/);
  } finally {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
});

test("ignores test file references", () => {
  mkdirSync(path.join(FIXTURE_DIR, "__tests__"), { recursive: true });
  writeFileSync(
    path.join(FIXTURE_DIR, "__tests__", "fixture.test.ts"),
    'export const marker = "requireRole ROLE_RANK";\n',
  );
  try {
    const { code } = runGate();
    assert.equal(code, 0, "test file references must not count");
  } finally {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
});
