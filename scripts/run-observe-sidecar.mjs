#!/usr/bin/env node
/**
 * MemRoOS observe sidecar (Wave 1 JSONL watchers).
 *
 * Usage:
 *   node scripts/run-observe-sidecar.mjs --dry-run
 *   MEMROOS_BASE_URL=http://localhost:3000 node scripts/run-observe-sidecar.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const WAVE1 = [
  { harness: "claude", root: ".claude/projects" },
  { harness: "codex", root: ".codex/sessions" },
  { harness: "hermes", root: ".hermes/sessions" },
  { harness: "openclaw", root: ".openclaw/sessions" },
  { harness: "pi", root: ".pi/agent/sessions" },
];

function parseArgs(argv) {
  const out = { dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/run-observe-sidecar.mjs [--dry-run]");
  process.exit(0);
}

const baseUrl = (
  process.env.MEMROOS_BASE_URL ||
  process.env.MEMROOS_OPERATOR_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const statePath =
  process.env.MEMROOS_OBSERVE_STATE ||
  path.join(os.homedir(), ".memroos", "observe-sidecar-state.json");

function listJsonl(root, maxDepth = 6) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  function walk(dir, depth) {
    if (depth > maxDepth || files.length >= 500) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
    }
  }
  walk(root, 0);
  return files;
}

function summarize(filePath) {
  const sessionId = path.basename(filePath, ".jsonl");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { sessionId, summary: `Session ${sessionId}`, lineCount: 0 };
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  return {
    sessionId,
    summary: (lines.slice(0, 5).join(" ").slice(0, 240) || `Session ${sessionId}`),
    lineCount: lines.length,
  };
}

function fingerprint(filePath) {
  const stat = fs.statSync(filePath);
  return createHash("sha256").update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest("hex");
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { seen: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function postCapture(payload) {
  if (args.dryRun) return { ok: true, dryRun: true, payload };
  const headers = { "content-type": "application/json", accept: "application/json" };
  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
  if (operatorKey) headers["x-memroos-operator-key"] = operatorKey;
  try {
    const response = await fetch(`${baseUrl}/api/agent-memory/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    return {
      ok: false,
      error: "memroos_unreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

const state = readState();
const results = [];
for (const entry of WAVE1) {
  const root = path.join(os.homedir(), entry.root);
  for (const file of listJsonl(root)) {
    const fp = fingerprint(file);
    if (state.seen[file] === fp) continue;
    const summary = summarize(file);
    const payload = {
      sourceAgentId: entry.harness,
      runtime: entry.harness,
      sessionId: summary.sessionId,
      summary: summary.summary,
      captureDepth: process.env.MEMROOS_CAPTURE_DEPTH || "relevant",
      metadata: {
        observeSidecar: true,
        harness: entry.harness,
        sessionPath: file,
        lineCount: summary.lineCount,
      },
    };
    const posted = await postCapture(payload);
    results.push({ file, harness: entry.harness, posted });
    if (posted.ok && !args.dryRun) state.seen[file] = fp;
  }
}
if (!args.dryRun) writeState(state);

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun: args.dryRun,
      baseUrl,
      captures: results.length,
      results: results.slice(0, 20),
    },
    null,
    2
  )
);
