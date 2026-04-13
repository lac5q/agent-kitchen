import { execFileSync } from "child_process";
import { stat as fsStat, readFile } from "fs/promises";
import { MEM0_URL, AGENT_CONFIGS_PATH, OBSIDIAN_VAULT_PATH, CURATOR_LOG_PATH } from "@/lib/constants";
import type { HealthStatus } from "@/types";

export const dynamic = "force-dynamic";

async function checkService(
  name: string,
  checkFn: () => Promise<void>
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await checkFn();
    return {
      service: name,
      status: "up",
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch {
    return {
      service: name,
      status: "down",
      latencyMs: null,
      lastCheck: new Date().toISOString(),
    };
  }
}

async function checkServiceTristate(
  name: string,
  checkFn: () => Promise<"up" | "degraded" | "down">
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const status = await checkFn();
    return {
      service: name,
      status,
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch {
    return {
      service: name,
      status: "down",
      latencyMs: null,
      lastCheck: new Date().toISOString(),
    };
  }
}

export async function obsidianStatus(): Promise<"up" | "degraded" | "down"> {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  const journalPath = `${OBSIDIAN_VAULT_PATH}/journals/${today}.md`;

  try {
    await fsStat(OBSIDIAN_VAULT_PATH);
  } catch {
    return "down"; // vault root inaccessible → error
  }

  try {
    await fsStat(journalPath);
    return "up"; // vault OK + today's journal exists → active
  } catch {
    return "degraded"; // vault OK but no journal yet today → idle/amber
  }
}

export async function curatorStatus(): Promise<"up" | "degraded" | "down"> {
  const WINDOW_MS = 26 * 60 * 60 * 1000; // 26 hours

  let logStats: Awaited<ReturnType<typeof fsStat>>;
  try {
    logStats = await fsStat(CURATOR_LOG_PATH);
  } catch {
    return "down"; // log missing → cron never ran or log cleared
  }

  if (Date.now() - logStats.mtimeMs > WINDOW_MS) {
    return "down"; // log not modified in 26h → missed cron
  }

  let content: string;
  try {
    content = await readFile(CURATOR_LOG_PATH, "utf8");
  } catch {
    return "down";
  }

  const lines = content.split("\n");

  // Find the last "Starting Knowledge Curator..." line — most recent run block
  let lastRunStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("Starting Knowledge Curator...")) {
      lastRunStart = i;
      break;
    }
  }

  if (lastRunStart === -1) {
    return "down"; // no valid run block found
  }

  const runLines = lines.slice(lastRunStart);
  const completed = runLines.some(l => l.includes("Knowledge Curator complete."));
  const hasWarnings = runLines.some(l => l.includes("Warning:"));

  if (!completed) return "down";   // run started but did not finish
  if (hasWarnings) return "degraded"; // ran with step failures → amber
  return "up"; // clean run → green
}

export async function GET() {
  const services = await Promise.all([
    checkService("RTK", async () => {
      execFileSync("rtk", ["--version"], { timeout: 2000 });
    }),
    checkService("mem0", async () => {
      await fetch(`${MEM0_URL}/health`, { signal: AbortSignal.timeout(2000) });
    }),
    checkService("QMD", async () => {
      execFileSync("which", ["qmd"], { timeout: 2000 });
    }),
    checkService("Agents", async () => {
      await fsStat(AGENT_CONFIGS_PATH);
    }),
    checkService("APO", async () => {
      const { stat } = await import("fs/promises");
      await stat(`${process.env.HOME}/.openclaw/skills/proposals`);
    }),
    checkServiceTristate("Obsidian", obsidianStatus),
    checkServiceTristate("Curator", curatorStatus),
  ]);

  return Response.json({ services, timestamp: new Date().toISOString() });
}
