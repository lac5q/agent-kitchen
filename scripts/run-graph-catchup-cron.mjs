#!/usr/bin/env node
/**
 * Launchd / cron wrapper: trigger incremental graph catchup via the MemRoOS API.
 *
 * The one-shot Qdrant scroll lives in scripts/run-graph-catchup.mjs (`npm run graph:catchup`).
 * This wrapper is what install-memory-resilience registers for durable 30-minute ticks.
 *
 * Usage:
 *   node scripts/run-graph-catchup-cron.mjs
 *   MEMROOS_BASE_URL=http://127.0.0.1:3000 node scripts/run-graph-catchup-cron.mjs
 */
const baseUrl = (process.env.MEMROOS_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const dryRun = process.env.DRY_RUN === "1" || process.env.GRAPH_CATCHUP_DRY_RUN === "1";
const batchSize = process.env.GRAPH_CATCHUP_BATCH_SIZE
  ? Number(process.env.GRAPH_CATCHUP_BATCH_SIZE)
  : undefined;

const headers = {
  "content-type": "application/json",
  accept: "application/json",
};
const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
if (operatorKey) {
  headers["x-memroos-operator-key"] = operatorKey;
}

const body = {
  dryRun,
  ...(Number.isFinite(batchSize) ? { batchSize } : {}),
  ...(process.env.GRAPH_CATCHUP_AGENT_ID
    ? { agentId: process.env.GRAPH_CATCHUP_AGENT_ID }
    : {}),
};

let response;
try {
  response = await fetch(`${baseUrl}/api/memory-lifecycle/graph-catchup`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
} catch (err) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: "memroos_unreachable",
        detail: err instanceof Error ? err.message : String(err),
        hint: "Start MemRoOS so in-app + launchd catchup can heartbeat cron_health.",
      },
      null,
      2
    )
  );
  // Soft-exit when app is down — avoid launchd crash loops.
  process.exit(0);
}

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!response.ok) {
  console.error(JSON.stringify({ ok: false, status: response.status, error: payload }, null, 2));
  process.exit(response.status === 409 ? 0 : 1);
}

console.log(
  JSON.stringify(
    { ok: Boolean(payload.ok), status: response.status, summary: payload.summary ?? payload },
    null,
    2
  )
);
process.exit(payload.ok === false ? 1 : 0);
