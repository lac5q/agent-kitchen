import { execFileSync } from "child_process";
import { stat as fsStat } from "fs/promises";
import { MEM0_URL } from "@/lib/constants";
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
      const agentsPath = `${process.env.HOME}/github/knowledge/agent-configs`;
      await fsStat(agentsPath);
    }),
  ]);

  return Response.json({ services, timestamp: new Date().toISOString() });
}
