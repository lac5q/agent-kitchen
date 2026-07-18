#!/usr/bin/env node
/**
 * One-shot Qdrant/mem0 → Neo4j graph catchup.
 *
 * Usage (from repo root):
 *   npm run graph:catchup
 *   node scripts/run-graph-catchup.mjs
 *   node scripts/run-graph-catchup.mjs --max-points 50 --skip-episodic
 *   node scripts/run-graph-catchup.mjs --dry-run
 *
 * Loads Neo4j from apps/memroos/.env.local and Qdrant from
 * services/memory/.env (or env already present). Does not print secrets.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(repoRoot, "apps/memroos/.env.local"));
loadEnvFile(path.join(repoRoot, "services/memory/.env"));

function parseArgs(argv) {
  const out = {
    pageSize: Number(process.env.GRAPH_CATCHUP_PAGE_SIZE || 50),
    batchSize: Number(process.env.GRAPH_CATCHUP_BATCH_SIZE || 50),
    writeDelayMs: Number(process.env.GRAPH_CATCHUP_WRITE_DELAY_MS || 200),
    maxPoints: Number(process.env.GRAPH_CATCHUP_MAX_POINTS || 0),
    skipEpisodic: false,
    skipVector: false,
    dryRun: false,
    projectEntities: true,
    agentId: process.env.GRAPH_CATCHUP_AGENT_ID || "luis",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--page-size" && next) {
      out.pageSize = Number(next);
      i += 1;
    } else if (arg === "--batch-size" && next) {
      out.batchSize = Number(next);
      i += 1;
    } else if (arg === "--write-delay-ms" && next) {
      out.writeDelayMs = Number(next);
      i += 1;
    } else if (arg === "--max-points" && next) {
      out.maxPoints = Number(next);
      i += 1;
    } else if (arg === "--agent-id" && next) {
      out.agentId = next;
      i += 1;
    } else if (arg === "--skip-episodic") {
      out.skipEpisodic = true;
    } else if (arg === "--skip-vector") {
      out.skipVector = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--no-entities") {
      out.projectEntities = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/run-graph-catchup.mjs [options]
  --page-size N
  --batch-size N
  --write-delay-ms N
  --max-points N
  --agent-id ID
  --skip-episodic
  --skip-vector
  --dry-run
  --no-entities`);
      process.exit(0);
    }
  }
  return out;
}

register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));
const requireFromHere = createRequire(import.meta.url);

const dbModule = requireFromHere(path.join(repoRoot, "apps/memroos/src/lib/db.ts"));
const catchup = requireFromHere(
  path.join(repoRoot, "apps/memroos/src/lib/memory/graph-catchup.ts")
);

const args = parseArgs(process.argv.slice(2));

if (!process.env.NEO4J_PASSWORD && !args.dryRun) {
  console.error(JSON.stringify({ ok: false, error: "NEO4J_PASSWORD not configured" }));
  process.exit(1);
}
if (!process.env.QDRANT_URL && !args.skipVector) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "QDRANT_URL not configured (needed for full vector catchup beyond mem0 /memory/all cap)",
    })
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: "graph-catchup-oneshot",
      pageSize: args.pageSize,
      batchSize: args.batchSize,
      writeDelayMs: args.writeDelayMs,
      maxPoints: args.maxPoints || null,
      skipEpisodic: args.skipEpisodic,
      skipVector: args.skipVector,
      dryRun: args.dryRun,
      projectEntities: args.projectEntities,
      neo4jConfigured: Boolean(process.env.NEO4J_PASSWORD),
      qdrantConfigured: Boolean(process.env.QDRANT_URL),
    },
    null,
    2
  )
);

const db = dbModule.getDb();
const summary = await catchup.runGraphCatchup(db, {
  oneshot: true,
  skipEpisodic: args.skipEpisodic,
  skipVector: args.skipVector,
  dryRun: args.dryRun,
  pageSize: args.pageSize,
  batchSize: args.batchSize,
  writeDelayMs: args.writeDelayMs,
  maxPoints: args.maxPoints,
  agentId: args.agentId,
  projectEntities: args.projectEntities,
  useQdrantScroll: Boolean(process.env.QDRANT_URL),
});

console.log(
  JSON.stringify(
    {
      ok: summary.status === "completed" || summary.status === "partial" || summary.status === "skipped",
      summary: {
        status: summary.status,
        reason: summary.reason,
        considered: summary.considered,
        projected: summary.projected,
        skipped: summary.skipped,
        errors: summary.errors,
        pages: summary.pages,
        neo4jBefore: summary.neo4jBefore,
        neo4jAfter: summary.neo4jAfter,
        sources: summary.sources,
        errorSamples: summary.errorSamples,
      },
    },
    null,
    2
  )
);

process.exit(summary.status === "failed" ? 1 : 0);
