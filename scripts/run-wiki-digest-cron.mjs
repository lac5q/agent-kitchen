#!/usr/bin/env node
/**
 * Launchd / cron wrapper: trigger wiki digest via the MemRoOS API.
 *
 * Usage:
 *   node scripts/run-wiki-digest-cron.mjs
 *   MEMROOS_BASE_URL=http://localhost:3000 node scripts/run-wiki-digest-cron.mjs
 */
const baseUrl = (process.env.MEMROOS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const dryRun = process.env.DRY_RUN === "1" || process.env.WIKI_DIGEST_DRY_RUN === "1";

const headers = {
  "content-type": "application/json",
  accept: "application/json",
};
const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
if (operatorKey) {
  headers["x-memroos-operator-key"] = operatorKey;
}

let response;
try {
  response = await fetch(`${baseUrl}/api/wiki/digest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ dryRun }),
  });
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "memroos_unreachable",
      detail: err instanceof Error ? err.message : String(err),
      hint: "Start MemRoOS so wiki-digest can heartbeat cron_health.",
    })
  );
  process.exit(0);
}

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}
console.log(JSON.stringify({ ok: response.ok, status: response.status, body }, null, 2));
process.exit(response.ok ? 0 : 1);
