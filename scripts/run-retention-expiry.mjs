#!/usr/bin/env node
/**
 * MEMLIFE-01: trigger retention expiry against a running MemRoOS instance.
 *
 * Usage:
 *   node scripts/run-retention-expiry.mjs
 *   MEMROOS_BASE_URL=http://127.0.0.1:3002 RETENTION_RUN_KEY=manual:once node scripts/run-retention-expiry.mjs
 *
 * Auth: loopback is allowed without a key; remote hosts need MEMROOS_OPERATOR_API_KEY.
 */
const baseUrl = (process.env.MEMROOS_BASE_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
const tenantId = process.env.RETENTION_TENANT_ID || "default-tenant";
const actorId = process.env.RETENTION_ACTOR_ID || "cron";
const now = new Date();
const hourBucket = now.toISOString().slice(0, 13);
const runKey =
  process.env.RETENTION_RUN_KEY || `retention:${tenantId}:${hourBucket}:cli`;

const headers = {
  "content-type": "application/json",
  accept: "application/json",
};
const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
if (operatorKey) {
  headers["x-memroos-operator-key"] = operatorKey;
}

const body = {
  tenantId,
  runKey,
  actorId,
  leaseOwner: `cli:${process.pid}`,
  scope: { tenantId },
};

const response = await fetch(`${baseUrl}/api/memory-lifecycle/expiry`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      { ok: false, status: response.status, runKey, error: payload },
      null,
      2
    )
  );
  process.exit(response.status === 409 ? 0 : 1);
}

console.log(
  JSON.stringify(
    {
      ok: Boolean(payload.ok),
      status: response.status,
      runKey,
      summary: payload.summary ?? payload,
    },
    null,
    2
  )
);
process.exit(payload.ok === false ? 1 : 0);
