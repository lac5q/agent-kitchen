#!/usr/bin/env node
// Regression tests for the LIBNORM-03 gate.

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE = path.join(ROOT, "scripts", "check-lib-boundary.mjs");
const LIB = path.join(ROOT, "apps", "memroos", "src", "lib");

function runGate() {
  try {
    return { code: 0, out: execFileSync("node", [GATE], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("passes on the current tree", () => {
  assert.equal(runGate().code, 0);
});

test("fails when a new file lands at the lib/ root", () => {
  const f = path.join(LIB, "__libnorm_fixture__.ts");
  writeFileSync(f, "export const x = 1;\n");
  try {
    const { code, out } = runGate();
    assert.equal(code, 1, "a new root-level file must fail the gate");
    assert.match(out, /__libnorm_fixture__\.ts/);
  } finally {
    rmSync(f, { force: true });
  }
});

test("allows the same file inside a domain directory", () => {
  const dir = path.join(LIB, "__libnorm_fixture_dir__");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "thing.ts"), "export const x = 1;\n");
  try {
    assert.equal(runGate().code, 0, "lib/<domain>/ is the sanctioned home");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
