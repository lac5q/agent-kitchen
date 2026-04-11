import { NextResponse } from "next/server";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { cleanMessage } from "@/lib/activity-cleanup";

export const dynamic = "force-dynamic";

const CRON_LOG = process.env.APO_CRON_LOG_PATH || `${process.env.HOME}/.openclaw/logs/agent-lightning-cron.log`;
const AGENT_CONFIGS = process.env.AGENT_CONFIGS_PATH || `${process.env.HOME}/github/knowledge/agent-configs`;
const PROPOSALS_PATH = process.env.APO_PROPOSALS_PATH || `${process.env.HOME}/.openclaw/skills/proposals`;

export interface ActivityEvent {
  id: string;
  timestamp: string;
  node: string; // which flow node this relates to
  type: "request" | "knowledge" | "memory" | "error" | "apo";
  message: string;
  severity: "info" | "warn" | "error";
}

export async function GET() {
  const events: ActivityEvent[] = [];

  // 1. Read last 50 lines of APO cron log for real events
  try {
    const log = await readFile(CRON_LOG, "utf-8");
    const lines = log.split("\n").filter(l => l.trim()).slice(-50);

    lines.forEach((line, idx) => {
      // Extract timestamp if present
      const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}:\d{2})/);
      const ts = tsMatch?.[1] ? new Date(tsMatch[1]).toISOString() : new Date().toISOString();

      if (line.includes("PROPOSAL") || line.includes("proposal")) {
        const msg = cleanMessage(line.replace(/^\[.*?\]\s*/, "").trim()).slice(0, 80);
        if (msg) events.push({
          id: `apo-${ts}-${idx}`,
          timestamp: ts,
          node: "cookbooks",
          type: "apo",
          message: msg,
          severity: "info",
        });
      } else if (line.includes("ERROR") || line.includes("FAIL") || line.includes("error")) {
        const msg = cleanMessage(line.replace(/^\[.*?\]\s*/, "").trim()).slice(0, 80);
        if (msg) events.push({
          id: `err-${ts}-${idx}`,
          timestamp: ts,
          node: "agents",
          type: "error",
          message: msg,
          severity: "error",
        });
      } else if (line.includes("audit") || line.includes("scan") || line.includes("QMD") || line.includes("search")) {
        const msg = cleanMessage(line.replace(/^\[.*?\]\s*/, "").trim()).slice(0, 80);
        if (msg) events.push({
          id: `qmd-${ts}-${idx}`,
          timestamp: ts,
          node: "librarian",
          type: "knowledge",
          message: msg,
          severity: "info",
        });
      } else if (line.includes("mem0") || line.includes("memory") || line.includes("remember")) {
        const msg = cleanMessage(line.replace(/^\[.*?\]\s*/, "").trim()).slice(0, 80);
        if (msg) events.push({
          id: `mem-${ts}-${idx}`,
          timestamp: ts,
          node: "notebooks",
          type: "memory",
          message: msg,
          severity: "info",
        });
      } else if (line.includes("Starting") || line.includes("Complete") || line.includes("cycle")) {
        const msg = cleanMessage(line.replace(/^\[.*?\]\s*/, "").trim()).slice(0, 80);
        if (msg) events.push({
          id: `apo-cycle-${ts}-${idx}`,
          timestamp: ts,
          node: "taskboard",
          type: "apo",
          message: msg,
          severity: "info",
        });
      }
    });
  } catch { /* log not available */ }

  // 2. Check recent heartbeat activity per agent
  try {
    const agents = await readdir(AGENT_CONFIGS);
    for (const agent of agents.slice(0, 10)) {
      try {
        const hbPath = path.join(AGENT_CONFIGS, agent, "HEARTBEAT.md");
        const hbStat = await stat(hbPath);
        const minsAgo = (Date.now() - hbStat.mtime.getTime()) / 60000;

        if (minsAgo < 60) {
          events.push({
            id: `hb-${agent}-${hbStat.mtime.toISOString()}`,
            timestamp: hbStat.mtime.toISOString(),
            node: "agents",
            type: "request",
            message: `${agent} heartbeat ${minsAgo < 5 ? "just now" : `${Math.round(minsAgo)}m ago`}`,
            severity: "info",
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // 3. Check recent APO proposals
  try {
    const files = await readdir(PROPOSALS_PATH);
    for (const f of files.filter(f => f.endsWith(".md")).slice(0, 5)) {
      const fStat = await stat(path.join(PROPOSALS_PATH, f));
      const minsAgo = (Date.now() - fStat.mtime.getTime()) / 60000;
      if (minsAgo < 120) {
        events.push({
          id: `proposal-${f}`,
          timestamp: fStat.mtime.toISOString(),
          node: "cookbooks",
          type: "apo",
          message: `APO proposal pending: ${f.replace("APO_PROPOSAL_", "").slice(0, 50)}`,
          severity: "warn",
        });
      }
    }
  } catch { /* skip */ }

  // Sort by timestamp descending, take most recent 20
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Compute which nodes are "hot" based on recent events (last 60 min)
  const now = Date.now();
  const nodeActivity: Record<string, number> = {};
  for (const e of events) {
    const minsAgo = (now - new Date(e.timestamp).getTime()) / 60000;
    if (minsAgo < 60) {
      nodeActivity[e.node] = Math.min(minsAgo, nodeActivity[e.node] ?? Infinity);
    }
  }

  return NextResponse.json({
    events: events.slice(0, 20),
    nodeActivity, // { nodeName: minutesAgo } for recently active nodes
    timestamp: new Date().toISOString(),
  });
}
