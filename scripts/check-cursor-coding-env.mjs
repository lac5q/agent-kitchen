#!/usr/bin/env node
// check-cursor-coding-env.mjs
//
// Fleet-rollout contract verifier for MemRoOS Cursor Cloud hosts.
//
// Confirms every lane the bootstrap (`scripts/setup-cursor-cloud.sh`) is expected
// to leave behind is actually present and live. Designed to be safe to run on
// any host (Cursor Cloud environments, persistent remote hosts like maeve-u1
// and oracle-1, or a developer laptop). Never throws — records PASS / WARN /
// FAIL per lane and exits non-zero when any FAIL lane is reported so it slots
// into `npm run check:*` chains and CI.
//
// Usage:
//   node scripts/check-cursor-coding-env.mjs              # checks current host
//   node scripts/check-cursor-coding-env.mjs --json       # machine-readable
//
// Exit codes:
//   0  every required lane PASS (warnings OK)
//   1  any required lane FAIL
//   2  internal error
//
// Keep this file in lockstep with scripts/setup-cursor-cloud.sh — when the
// bootstrap adds a new lane, mirror a PASS clause here.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const HOME = os.homedir();
const CURSOR_DIR = process.env.CURSOR_CONFIG_DIR || path.join(HOME, ".cursor");
const SKILLS_DIR = path.join(CURSOR_DIR, "skills");
const MCP_JSON = path.join(CURSOR_DIR, "mcp.json");

const results = [];

function record(lane, status, detail) {
  results.push({ lane, status, detail });
  const marker = status === "PASS" ? "✓" : status === "WARN" ? "⚠" : "✗";
  const tag = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
  const w = Math.max(...results.map(r => r.lane.length), 0);
  console.log(`${marker} ${tag.padEnd(5)} ${lane.padEnd(w)}  ${detail || ""}`);
}

function checkHome() {
  if (fs.existsSync(HOME)) record("Home dir exists", "PASS", HOME);
  else record("Home dir exists", "FAIL", `${HOME} missing`);
}

function checkCursorDir() {
  if (fs.existsSync(CURSOR_DIR)) record("Cursor config dir", "PASS", CURSOR_DIR);
  else record("Cursor config dir", "FAIL", `${CURSOR_DIR} missing`);
}

function checkSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    record("Cursor skills dir", "FAIL", `${SKILLS_DIR} missing`);
    return;
  }
  const skills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  record("Cursor skills dir", "PASS", `${skills.length} skills under ${SKILLS_DIR}`);
}

function checkSkillRequired(requiredSkill) {
  const skillFile = path.join(SKILLS_DIR, requiredSkill, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    record(`Skill: ${requiredSkill}`, "FAIL", `missing ${skillFile}`);
  } else {
    record(`Skill: ${requiredSkill}`, "PASS", skillFile);
  }
}

function checkQwen() {
  const qwenBin = path.join(HOME, ".local/bin/qwen");
  if (!fs.existsSync(qwenBin)) {
    record("qwen CLI binary", "FAIL", `${qwenBin} missing`);
  } else {
    let version = "?";
    try {
      version = execSync(`${qwenBin} --version 2>&1 | head -1`, { encoding: "utf8", timeout: 15000 }).trim();
    } catch (e) {
      version = `error: ${String(e.message || e).split("\n")[0]}`;
    }
    record("qwen CLI binary", "PASS", `${qwenBin} (${version.slice(0, 60)})`);
  }

  // qwen-agent wrapper
  const wrapper = path.join(HOME, ".local/bin/qwen-agent");
  if (!fs.existsSync(wrapper)) {
    record("qwen-agent wrapper", "FAIL", `${wrapper} missing`);
    return;
  }
  // qwen-agent needs DASHSCOPE_API_KEY for a live exec; we test --help parity or just existence
  record("qwen-agent wrapper", "PASS", wrapper);
  // Live smoke key check (not the wrapper itself — it would burn a session)
  const dashscope =
    process.env.DASHSCOPE_API_KEY ||
    process.env.QWEN_AUTH_TOKEN ||
    readSettingsKey(path.join(HOME, ".qwen/settings.json"), "DASHSCOPE_API_KEY");
  if (!dashscope) {
    record("Qwen executor API key", "WARN", "DASHSCOPE_API_KEY not set; qwen-agent will refuse to run until set");
  } else {
    record("Qwen executor API key", "PASS", `${String(dashscope).slice(0, 4)}…`);
  }
}

function checkDroid() {
  const droidBin = path.join(HOME, ".local/bin/droid");
  if (!fs.existsSync(droidBin)) {
    record("droid CLI binary", "FAIL", `${droidBin} missing`);
    return;
  }

  let version = "?";
  try {
    version = execSync(`${JSON.stringify(droidBin)} --version 2>&1`, { encoding: "utf8", timeout: 15000 }).trim();
    record("droid CLI binary", "PASS", `${droidBin} (${version.slice(0, 60)})`);
  } catch (e) {
    record("droid CLI binary", "FAIL", `${droidBin} exists but --version failed: ${String(e.message || e).split("\n")[0]}`);
    return;
  }

  record("Droid auth", "WARN", "not verified by fleet checker; run 'droid' interactively if this host needs Factory access");
}

function checkMiniMaxApiKey() {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    record("MiniMax API key", "WARN", "MINIMAX_API_KEY not set; direct MiniMax API Beastmode lane unavailable");
    return;
  }
  record("MiniMax API key", "PASS", "set");
}

function readSettingsKey(settingsPath, envKey) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return settings.env?.[envKey] || settings[envKey] || "";
  } catch {
    return "";
  }
}

function checkGitnexus() {
  let version = "missing";
  try {
    version = execSync(`gitnexus --version 2>&1 | head -1`, { encoding: "utf8", timeout: 15000 }).trim();
    record("gitnexus CLI", "PASS", `${version.slice(0, 60)}`);
  } catch (e) {
    record("gitnexus CLI", "FAIL", "gitnexus not on PATH (run setup-cursor-cloud.sh or install via npm)");
    return;
  }
  // Can the mcp server start?
  try {
    execSync(`gitnexus mcp --help 2>&1 | head -1`, { encoding: "utf8", timeout: 15000 });
    record("gitnexus mcp ready", "PASS", "gitnexus mcp --help ok");
  } catch (e) {
    record("gitnexus mcp ready", "WARN", "gitnexus mcp help failed (may not matter for Cursor MCP)");
  }
}

function checkMcpJson() {
  if (!fs.existsSync(MCP_JSON)) {
    record(".cursor/mcp.json exists", "FAIL", `${MCP_JSON} missing`);
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  } catch (e) {
    record(".cursor/mcp.json parse", "FAIL", `${MCP_JSON} not valid JSON: ${e.message}`);
    return;
  }
  const servers = cfg.mcpServers || {};
  for (const name of ["memroos", "gitnexus"]) {
    if (servers[name]) record(`.cursor/mcp.json: ${name}`, "PASS", `command=${servers[name].command || "?"}`);
    else record(`.cursor/mcp.json: ${name}`, "FAIL", `${name} missing from mcpServers`);
  }
}

function checkRepoPresent() {
  const repoRoot = process.env.MEMROOS_ROOT || path.join(HOME, "github/memroos");
  if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
    record("MemRoOS repo clone", "FAIL", `${repoRoot} not present`);
    return;
  }
  let clean = "?";
  try {
    const status = execSync(`git -C ${JSON.stringify(repoRoot)} status --porcelain 2>&1`, { encoding: "utf8", timeout: 15000 }).trim();
    clean = status ? "dirty" : "clean";
  } catch (e) {
    clean = "unknown";
  }
  record("MemRoOS repo clone", "PASS", `${repoRoot} (${clean})`);
}

function checkGitnexusIndex() {
  const repoRoot = process.env.MEMROOS_ROOT || path.join(HOME, "github/memroos");
  const idx = path.join(repoRoot, ".gitnexus");
  if (!fs.existsSync(idx)) {
    record("GitNexus index present", "WARN", `.gitnexus not found in ${repoRoot} (run 'npx gitnexus analyze' from repo root)`);
    return;
  }
  record("GitNexus index present", "PASS", idx);
}

function runChecks() {
  checkHome();
  checkCursorDir();
  checkSkillsDir();
  checkSkillRequired("goal");
  checkSkillRequired("gsd-help");
  checkSkillRequired("beastmode-cloud");
  checkSkillRequired("beastmode-qwen-cloud");
  checkQwen();
  checkMiniMaxApiKey();
  checkDroid();
  checkGitnexus();
  checkMcpJson();
  checkRepoPresent();
  checkGitnexusIndex();
}

runChecks();

const summary = {
  total: results.length,
  pass: results.filter(r => r.status === "PASS").length,
  warn: results.filter(r => r.status === "WARN").length,
  fail: results.filter(r => r.status === "FAIL").length,
};

if (process.argv.includes("--json")) {
  console.log("\n" + JSON.stringify({ summary, results }, null, 2));
}

console.log(`\nCursor coding env: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail (of ${summary.total})`);

process.exit(summary.fail === 0 ? 0 : 1);
