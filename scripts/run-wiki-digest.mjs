#!/usr/bin/env node
/**
 * One-shot memory → wiki digest runner.
 *
 * Usage:
 *   node scripts/run-wiki-digest.mjs --dry-run
 *   KNOWLEDGE_BASE_PATH=/path/to/knowledge node scripts/run-wiki-digest.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = { dryRun: false, agentId: undefined, limit: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--agent-id") out.agentId = argv[++i];
    else if (arg === "--limit") out.limit = Number(argv[++i]);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/run-wiki-digest.mjs [--dry-run] [--agent-id ID] [--limit N]`);
  process.exit(0);
}

// Prefer compiled/ts path via tsx if available; otherwise dynamic import from app dist is not required —
// load through the Next app path by spawning vitest-less jiti-style require of the source via tsx.
async function main() {
  let runWikiDigest;
  try {
    const mod = await import(
      pathToFileURL(path.join(root, "apps/memroos/src/lib/wiki-digest.ts")).href
    );
    runWikiDigest = mod.runWikiDigest;
  } catch {
    // Fall back: register ts-node/tsx if present
    try {
      require("tsx/cjs/api").register();
    } catch {
      // ignore
    }
    const mod = require(path.join(root, "apps/memroos/src/lib/wiki-digest.ts"));
    runWikiDigest = mod.runWikiDigest;
  }

  const summary = await runWikiDigest({
    dryRun: args.dryRun,
    agentId: args.agentId,
    limit: Number.isFinite(args.limit) ? args.limit : undefined,
  });
  console.log(JSON.stringify({ ok: summary.status !== "failed", summary }, null, 2));
  process.exit(summary.status === "failed" ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
