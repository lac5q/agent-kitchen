#!/usr/bin/env node
/**
 * MemRoOS operator CLI — Phase 127 (ENTOPS-08).
 *
 * Launches bin/memroos-bootstrap.mjs under Node 22 --experimental-strip-types
 * so apps/memroos TypeScript libraries load with @/* aliases.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP = path.join(__dirname, "memroos-bootstrap.mjs");

if (!fs.existsSync(BOOTSTRAP)) {
  console.error(`memroos: bootstrap missing at ${BOOTSTRAP}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", BOOTSTRAP, ...process.argv.slice(2)],
  {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
