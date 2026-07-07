#!/usr/bin/env node

const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    return match ? [[match[1], match[2]]] : [];
  })
);

const goalId = args.get("goal-id") ?? args.get("goal_id");
const agentId = args.get("agent") ?? process.env.MEMROOS_AGENT_ID;
const apiKey = args.get("api-key") ?? process.env.MEMROOS_AGENT_API_KEY;
const baseUrl = args.get("base-url") ?? process.env.MEMROOS_BASE_URL ?? "http://localhost:3002";

if (!goalId || !agentId || !apiKey) {
  console.error("Usage: show-agent-context-packet --goal-id=<id> --agent=<agent-id> --api-key=<agent-api-key> [--base-url=http://localhost:3002]");
  process.exit(2);
}

const url = new URL("/api/agent-context", baseUrl);
url.searchParams.set("goal_id", goalId);
url.searchParams.set("agent", agentId);
for (const key of ["lane", "project", "repo", "client", "cwd"]) {
  if (args.has(key)) url.searchParams.set(key, args.get(key));
}

const response = await fetch(url, {
  headers: {
    authorization: `Bearer ${apiKey}`,
  },
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
