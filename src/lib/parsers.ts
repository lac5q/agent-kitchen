import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import type { Agent, AgentStatus, AgentPlatform, MemoryEntry } from "@/types";

function detectPlatform(agentName: string): AgentPlatform {
  const name = agentName.toLowerCase();
  if (name.includes("qwen")) return "qwen";
  if (name.includes("gemini")) return "gemini";
  if (name.includes("codex")) return "codex";
  if (name.includes("opencode") || name.includes("hermes")) return "opencode";
  return "claude";
}

function detectStatus(
  heartbeatContent: string | null,
  lastModified: Date | null
): AgentStatus {
  if (!lastModified) return "dormant";
  const minutesAgo = (Date.now() - lastModified.getTime()) / 60000;
  if (
    heartbeatContent?.toLowerCase().includes("error") ||
    heartbeatContent?.toLowerCase().includes("blocked")
  )
    return "error";
  if (minutesAgo < 5) return "active";
  if (minutesAgo < 1440) return "idle";
  return "dormant";
}

export async function parseAgents(configsPath: string): Promise<Agent[]> {
  const agents: Agent[] = [];
  let entries: string[];
  try {
    entries = await readdir(configsPath);
  } catch {
    return agents;
  }

  for (const entry of entries) {
    const agentDir = path.join(configsPath, entry);
    const dirStat = await stat(agentDir).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    let heartbeatContent: string | null = null;
    let heartbeatMtime: Date | null = null;
    try {
      const hbPath = path.join(agentDir, "HEARTBEAT.md");
      heartbeatContent = await readFile(hbPath, "utf-8");
      heartbeatMtime = (await stat(hbPath)).mtime;
    } catch {
      /* no heartbeat file */
    }

    let currentTask: string | null = null;
    try {
      const statePath = path.join(agentDir, "HEARTBEAT_STATE.md");
      const stateContent = await readFile(statePath, "utf-8");
      const firstLine = stateContent
        .split("\n")
        .find((l) => l.trim().length > 0);
      currentTask = firstLine?.replace(/^#+\s*/, "").trim() || null;
    } catch {
      /* no state file */
    }

    let lessonsCount = 0;
    try {
      const lessons = await readFile(
        path.join(agentDir, "LESSONS.md"),
        "utf-8"
      );
      lessonsCount = (lessons.match(/^-\s/gm) || []).length;
    } catch {
      /* no lessons */
    }

    let todayMemoryCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const memDir = path.join(agentDir, "memory");
      const memFiles = await readdir(memDir);
      todayMemoryCount = memFiles.filter((f) => f.includes(today)).length;
    } catch {
      /* no memory dir */
    }

    agents.push({
      id: entry,
      name: entry
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      role: extractRole(entry),
      platform: detectPlatform(entry),
      status: detectStatus(heartbeatContent, heartbeatMtime),
      lastHeartbeat: heartbeatMtime?.toISOString() || null,
      currentTask,
      lessonsCount,
      todayMemoryCount,
    });
  }

  return agents.sort((a, b) => {
    const order: Record<AgentStatus, number> = {
      active: 0,
      error: 1,
      idle: 2,
      dormant: 3,
    };
    return order[a.status] - order[b.status];
  });
}

function extractRole(dirName: string): string {
  const roles: Record<string, string> = {
    ceo: "Head Chef",
    cto: "Kitchen Architect",
    cmo: "Front of House",
    "chief-of-staff": "Sous Chef",
    "chief-product-architect": "Menu Designer",
    "founding-engineer": "Line Cook",
    "growth-strategist": "Reservations",
    "content-creator": "Pastry Chef",
    "graphic-designer": "Plating Artist",
    "seo-specialist": "Window Display",
    "social-media-manager": "Town Crier",
    "marketing-qa": "Health Inspector",
    "claude-sonnet-engineer": "Prep Cook",
    "gemini-senior-engineer": "Guest Chef",
    "qwen-engineer": "Commis Chef",
  };
  return roles[dirName] || "Kitchen Staff";
}

export function parseTokenStats(): Record<string, unknown> | null {
  try {
    const output = execFileSync("rtk", ["gain"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return parseRtkOutput(output);
  } catch {
    return null;
  }
}

function parseRtkOutput(output: string): Record<string, unknown> {
  const lines = output.split("\n");
  const stats: Record<string, unknown> = { raw: output, commandBreakdown: [] };

  for (const line of lines) {
    if (line.includes("Total commands:")) {
      const match = line.match(/([\d,]+)/);
      if (match) stats.totalCommands = parseInt(match[1].replace(/,/g, ""));
    }
    if (line.includes("Input tokens:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.totalInput = parseTokenCount(match[1]);
    }
    if (line.includes("Output tokens:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.totalOutput = parseTokenCount(match[1]);
    }
    if (line.includes("Tokens saved:")) {
      const match = line.match(/([\d,.]+[MKB]?)/);
      if (match) stats.tokensSaved = parseTokenCount(match[1]);
      const pctMatch = line.match(/([\d.]+)%/);
      if (pctMatch) stats.savingsPercent = parseFloat(pctMatch[1]);
    }
    if (line.includes("Avg execution:") || line.includes("avg:")) {
      const match = line.match(/([\d.]+)s/);
      if (match) stats.avgExecutionTime = parseFloat(match[1]);
    }
  }

  return stats;
}

function parseTokenCount(str: string): number {
  const num = parseFloat(str.replace(/,/g, ""));
  if (str.endsWith("M")) return num * 1_000_000;
  if (str.endsWith("K")) return num * 1_000;
  if (str.endsWith("B")) return num * 1_000_000_000;
  return num;
}

export async function parseClaudeMemory(
  claudeProjectsPath: string
): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];
  let projects: string[];
  try {
    projects = await readdir(claudeProjectsPath);
  } catch {
    return entries;
  }

  for (const project of projects) {
    const memDir = path.join(claudeProjectsPath, project, "memory");
    let files: string[];
    try {
      files = await readdir(memDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".md") || file === "MEMORY.md") continue;
      try {
        const filePath = path.join(memDir, file);
        const content = await readFile(filePath, "utf-8");
        const typeMatch = content.match(
          /type:\s*(user|feedback|project|reference)/
        );
        entries.push({
          id: `${project}/${file}`,
          content: content.replace(/---[\s\S]*?---/, "").trim(),
          agent: "claude",
          date: (await stat(filePath)).mtime.toISOString(),
          type: (typeMatch?.[1] as MemoryEntry["type"]) || "project",
          source: filePath,
        });
      } catch {
        /* skip unreadable */
      }
    }
  }

  return entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
