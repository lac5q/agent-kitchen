#!/usr/bin/env node
/**
 * MemRoOS observe sidecar (Wave 1/2 JSONL watchers).
 *
 * The sidecar is deterministic-first: it extracts structured capture fields
 * from JSONL and sends only the relevant projection by default. It is safe to
 * run from launchd/systemd/cron; every run records an observe-sidecar
 * heartbeat in cron_health_jobs when the operator endpoint is reachable.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { extractSessionJsonl } from "./observe-session-extraction.mjs";

export const WAVE1 = [
  { harness: "claude", root: ".claude/projects" },
  { harness: "codex", root: ".codex/sessions" },
  { harness: "hermes", root: ".hermes/sessions" },
  { harness: "openclaw", root: ".openclaw/sessions" },
  { harness: "pi", root: ".pi/agent/sessions" },
];

export const WAVE2 = [
  { harness: "cursor", root: ".cursor/projects" },
  { harness: "factory", root: ".factory" },
];

export function parseArgs(argv) {
  const out = { dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

export function listJsonl(root, maxDepth = 6) {
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

export function summarizeSessionJsonl(filePath) {
  const sessionId = path.basename(filePath, ".jsonl");
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return {
      sessionId,
      summary: `Session ${sessionId}`,
      lineCount: 0,
      decisions: [],
      outcomes: [],
      errors: [],
      commands: [],
      files: [],
      entities: [],
      verification: [],
      events: [],
    };
  }
  return { ...extractSessionJsonl(content, sessionId) };
}

export const summarize = summarizeSessionJsonl;

function fingerprint(filePath) {
  const stat = fs.statSync(filePath);
  return createHash("sha256").update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest("hex");
}

function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { seen: {} };
  } catch {
    return { seen: {} };
  }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function baseUrlFromEnv() {
  return (
    process.env.MEMROOS_BASE_URL ||
    process.env.MEMROOS_OPERATOR_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postCapture(baseUrl, payload, { dryRun = false } = {}) {
  if (dryRun) return { ok: true, dryRun: true, payload };
  const headers = { "content-type": "application/json", accept: "application/json" };
  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
  if (operatorKey) headers["x-memroos-operator-key"] = operatorKey;
  try {
    const response = await fetchJson(`${baseUrl}/api/agent-memory/capture`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }, 3500);
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
      error: err?.name === "AbortError" ? "capture_timeout" : "memroos_unreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function postHeartbeat(baseUrl, { success, itemsProcessed, warning = null, dryRun = false }) {
  if (dryRun) return { ok: true, dryRun: true };
  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
  if (!operatorKey) return { ok: false, error: "operator_key_unavailable" };
  const now = new Date().toISOString();
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "x-memroos-operator-key": operatorKey,
  };
  const body = {
    id: "observe-sidecar",
    name: "Observe session sidecar",
    sourceFamily: "observe",
    schedule: "every 5 minutes",
    expectedIntervalMinutes: 5,
    lastRunAt: now,
    lastSuccessAt: success ? now : null,
    lastFailureAt: success ? null : now,
    itemsProcessed,
    warning,
    metadata: { heartbeat: "observe-sidecar", extraction: "structured-v2" },
  };
  try {
    const response = await fetchJson(`${baseUrl}/api/cron-health`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, 750);
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runSidecar({ homeDir = os.homedir(), statePath, baseUrl = baseUrlFromEnv(), dryRun = false, wave = Number(process.env.MEMROOS_OBSERVE_WAVE || 2) } = {}) {
  const resolvedStatePath = statePath || process.env.MEMROOS_OBSERVE_STATE || path.join(homeDir, ".memroos", "observe-sidecar-state.json");
  const state = readState(resolvedStatePath);
  const results = [];
  const targets = wave >= 2 ? [...WAVE1, ...WAVE2] : WAVE1;

  try {
    for (const entry of targets) {
      const root = path.join(homeDir, entry.root);
      for (const file of listJsonl(root)) {
        const fp = fingerprint(file);
        if (state.seen?.[file] === fp) continue;
        const summary = summarizeSessionJsonl(file);
        const payload = {
          sourceAgentId: entry.harness,
          runtime: entry.harness,
          sessionId: summary.sessionId,
          summary: summary.summary,
          decisionIntent: summary.decisions.length > 0 ? { decisions: summary.decisions } : undefined,
          sources: summary.entities,
          files: summary.files,
          commands: summary.commands,
          errors: summary.errors,
          verification: summary.verification,
          events: summary.events,
          captureDepth: process.env.MEMROOS_CAPTURE_DEPTH || "relevant",
          metadata: {
            observeSidecar: true,
            structuredExtraction: "v2",
            harness: entry.harness,
            sessionPath: file,
            lineCount: summary.lineCount,
            outcomes: summary.outcomes,
            entities: summary.entities,
          },
        };
        const posted = await postCapture(baseUrl, payload, { dryRun });
        results.push({ file, harness: entry.harness, posted });
        if (posted.ok && !dryRun) {
          state.seen = state.seen || {};
          state.seen[file] = fp;
        }
      }
    }
    if (!dryRun) writeState(resolvedStatePath, state);
    const heartbeat = await postHeartbeat(baseUrl, {
      success: true,
      itemsProcessed: results.filter((result) => result.posted.ok).length,
      warning: results.some((result) => !result.posted.ok) ? "one or more captures failed" : null,
      dryRun,
    });
    return { ok: true, dryRun, baseUrl, captures: results.length, results, heartbeat };
  } catch (error) {
    const heartbeat = await postHeartbeat(baseUrl, {
      success: false,
      itemsProcessed: results.length,
      warning: error instanceof Error ? error.message : String(error),
      dryRun,
    });
    return {
      ok: false,
      dryRun,
      baseUrl,
      captures: results.length,
      results,
      heartbeat,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/run-observe-sidecar.mjs [--dry-run]");
    process.exit(0);
  }
  const result = await runSidecar({ dryRun: args.dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
