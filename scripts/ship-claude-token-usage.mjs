#!/usr/bin/env node
/**
 * Ship Claude Code JSONL token usage to a remote MemRoOS brain (Phase 204/205
 * follow-up: durable token tracking for the Ledger).
 *
 * Reads ~/.claude/projects JSONL session files incrementally (per-file byte
 * offsets persisted in a state file), aggregates assistant-message usage with
 * the SAME semantics as apps/memroos/src/lib/parsers.ts (inputTokens =
 * input_tokens + cache_creation_input_tokens; dedupe by requestId), and POSTs
 * one model-routing telemetry event per model to the target MemRoOS app.
 * recordModelRoutingEvent mirrors token fields into the durable efficiency
 * token_ledger, which /api/model-usage and the Ledger UI read.
 *
 * Config (env, or a KEY=VALUE env file passed as --env-file):
 *   MEMROOS_APP_URL            target brain, e.g. https://memroos.epiloguecapital.com
 *   MEMROOS_OPERATOR_API_KEY   operator key (Bearer) for /api/model-routing/telemetry
 *   CLAUDE_PROJECTS_PATH       default: ~/.claude/projects
 *   TOKEN_SHIP_STATE_FILE      default: ~/.memroos/token-ship-state.json
 *
 * Safe to run on a timer: no new data means no POSTs. Never prints the key.
 */

import { createReadStream } from "fs";
import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import os from "os";
import path from "path";
import readline from "readline";

const MAX_REMEMBERED_REQUEST_IDS = 5000;

function parseArgs(argv) {
  const args = { envFile: null, dryRun: false, backfillDays: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--env-file") args.envFile = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--backfill-days") args.backfillDays = Number(argv[++i]) || 0;
  }
  return args;
}

async function loadEnvFile(filePath) {
  const raw = await readFile(filePath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

async function loadState(stateFile) {
  try {
    const parsed = JSON.parse(await readFile(stateFile, "utf-8"));
    return {
      files: parsed.files ?? {},
      recentRequestIds: parsed.recentRequestIds ?? [],
      lastRunAt: parsed.lastRunAt ?? null,
    };
  } catch {
    return { files: {}, recentRequestIds: [], lastRunAt: null };
  }
}

async function listJsonlFiles(root) {
  const out = [];
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const dir = path.join(root, p.name);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.endsWith(".jsonl")) out.push(path.join(dir, name));
    }
  }
  return out;
}

/** Aggregate usage from `filePath` starting at byte `offset` (append-only tail). */
function aggregateTail(filePath, offset, acc, seen) {
  return new Promise((resolve) => {
    let stream;
    try {
      stream = createReadStream(filePath, { encoding: "utf-8", start: offset });
    } catch {
      resolve();
      return;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line) return;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "assistant") return;
        const msg = entry.message;
        if (!msg?.model || !msg?.usage) return;
        const reqId = entry.requestId;
        if (reqId) {
          if (seen.has(reqId)) return;
          seen.add(reqId);
        }
        const u = msg.usage;
        const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        const outputTokens = u.output_tokens ?? 0;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const existing = acc.get(msg.model) ?? {
          inputTokens: 0,
          outputTokens: 0,
          cacheRead: 0,
          requests: 0,
        };
        existing.inputTokens += inputTokens;
        existing.outputTokens += outputTokens;
        existing.cacheRead += cacheRead;
        existing.requests += 1;
        acc.set(msg.model, existing);
      } catch {
        /* skip malformed lines */
      }
    });
    rl.on("close", resolve);
    rl.on("error", () => resolve());
  });
}

function providerForModel(model) {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("fable") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) {
    return "anthropic";
  }
  if (m.includes("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  if (m.includes("gemini")) return "google";
  return "unknown";
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.envFile) await loadEnvFile(args.envFile);

  const appUrl = (process.env.MEMROOS_APP_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.MEMROOS_OPERATOR_API_KEY ?? "";
  if (!appUrl || !apiKey) {
    console.error("MEMROOS_APP_URL and MEMROOS_OPERATOR_API_KEY are required");
    process.exit(2);
  }

  const projectsRoot =
    process.env.CLAUDE_PROJECTS_PATH ?? path.join(os.homedir(), ".claude", "projects");
  const stateFile =
    process.env.TOKEN_SHIP_STATE_FILE ??
    path.join(os.homedir(), ".memroos", "token-ship-state.json");

  const state = await loadState(stateFile);
  const seen = new Set(state.recentRequestIds);
  const acc = new Map();
  const files = await listJsonlFiles(projectsRoot);

  for (const filePath of files) {
    let size;
    try {
      size = (await stat(filePath)).size;
    } catch {
      continue;
    }
    const prev = state.files[filePath];
    // First sighting: baseline at current size WITHOUT shipping history, so a
    // fresh install doesn't re-report months of past usage in one burst.
    // With --backfill-days N, files modified within N days are read from the
    // start once (their tokens land on the ship date, tagged as backfill).
    if (!prev) {
      let backfill = false;
      if (args.backfillDays > 0) {
        try {
          const mtime = (await stat(filePath)).mtimeMs;
          backfill = Date.now() - mtime < args.backfillDays * 86400000;
        } catch {
          backfill = false;
        }
      }
      if (!backfill) {
        state.files[filePath] = { offset: size };
        continue;
      }
      state.files[filePath] = { offset: 0 };
    }
    let offset = state.files[filePath].offset;
    if (size < offset) offset = 0; // truncated/rotated — re-read
    if (size > offset) {
      await aggregateTail(filePath, offset, acc, seen);
      state.files[filePath] = { offset: size };
    }
  }

  let shipped = 0;
  for (const [model, usage] of acc) {
    if (usage.inputTokens + usage.outputTokens + usage.cacheRead === 0) continue; // synthetic/no-op entries
    const body = {
      taskType: "harness-session",
      agentId: `claude-jsonl:${os.hostname()}`,
      provider: providerForModel(model),
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cacheRead,
      totalTokens: usage.inputTokens + usage.outputTokens,
      success: true,
      contextTags: args.backfillDays > 0 ? ["token-ship", "claude-jsonl", "backfill"] : ["token-ship", "claude-jsonl"],
    };
    if (args.dryRun) {
      console.log(`[dry-run] would ship ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheRead} requests=${usage.requests}`);
      continue;
    }
    const res = await fetch(`${appUrl}/api/model-routing/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`ship failed for ${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1); // keep state unwritten so this delta re-ships next run
    }
    shipped += 1;
  }

  if (!args.dryRun) {
    state.recentRequestIds = [...seen].slice(-MAX_REMEMBERED_REQUEST_IDS);
    state.lastRunAt = new Date().toISOString();
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify(state, null, 2));
  }
  console.log(
    `token-ship: ${files.length} files scanned, ${acc.size} models aggregated, ${shipped} events shipped${args.dryRun ? " (dry-run)" : ""}`
  );
}

main().catch((err) => {
  console.error("token-ship fatal:", err?.message ?? err);
  process.exit(1);
});
