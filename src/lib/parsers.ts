import { readdir, readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import readline from "readline";
import { execFileSync } from "child_process";
import type { Agent, AgentStatus, AgentPlatform, MemoryEntry } from "@/types";

export interface ModelUsageStat {
  id: string;
  name: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  requests: number;
  totalTokens: number;
}

export interface ModelUsage {
  models: ModelUsageStat[];
  total: { inputTokens: number; outputTokens: number; requests: number };
}

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

  // Only flag as error on explicit error markers, not incidental word matches
  if (heartbeatContent) {
    const hasError =
      /(\[BLOCKED\]|\[ERROR\]|STATUS:\s*error|STATUS:\s*blocked|\*\*BLOCKED\*\*|\*\*ERROR\*\*)/i.test(
        heartbeatContent
      );
    if (hasError) return "error";
  }

  if (minutesAgo < 5) return "active";
  if (minutesAgo < 1440) return "idle"; // within 24 hours
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

// Default role mapping — extend or override for your agent naming conventions
const DEFAULT_ROLES: Record<string, string> = {
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

function extractRole(dirName: string): string {
  return DEFAULT_ROLES[dirName] || "Kitchen Staff";
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
    // Match "avg X.Xs" as produced by "Total exec time: 1053m34s (avg 4.8s)"
    if (line.includes("avg ")) {
      const match = line.match(/avg\s+([\d.]+)s/);
      if (match) stats.avgExecutionTime = parseFloat(match[1]);
    }
  }

  // Parse "By Command" section
  const byCommandIndex = output.indexOf("By Command");
  if (byCommandIndex !== -1) {
    const section = output.slice(byCommandIndex);
    const sectionLines = section.split("\n");
    const breakdown: {
      command: string;
      count: number;
      tokensSaved: number;
      savingsPercent: number;
    }[] = [];

    for (const line of sectionLines) {
      // Match lines like: " 1.  rtk find                    411   45.4M   68.0%    4.2s  ██████████"
      const match = line.match(
        /^\s*\d+\.\s+(rtk\s+\S+(?:\s+\S+)*?)\s{2,}(\d[\d,]*)\s+([\d,.]+[MKB]?)\s+([\d.]+)%/
      );
      if (match) {
        // Trim the command name — it may be truncated with "..."
        const command = match[1].trim().replace(/\s{2,}.*$/, "");
        const count = parseInt(match[2].replace(/,/g, ""));
        const tokensSaved = parseTokenCount(match[3]);
        const savingsPercent = parseFloat(match[4]);
        breakdown.push({ command, count, tokensSaved, savingsPercent });
      }
    }

    // Sort descending by tokensSaved
    breakdown.sort((a, b) => b.tokensSaved - a.tokensSaved);
    stats.commandBreakdown = breakdown;
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

function normalizeModelName(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.includes("opus")) {
    if (m.includes("4-6") || m.includes("4.6")) return "Opus 4.6";
    if (m.includes("4-5") || m.includes("4.5")) return "Opus 4.5";
    return "Opus";
  }
  if (m.includes("sonnet")) {
    if (m.includes("4-6") || m.includes("4.6")) return "Sonnet 4.6";
    if (m.includes("4-5") || m.includes("4.5")) return "Sonnet 4.5";
    return "Sonnet";
  }
  if (m.includes("haiku")) {
    if (m.includes("4-5") || m.includes("4.5")) return "Haiku 4.5";
    return "Haiku";
  }
  return modelId.length > 20 ? modelId.slice(0, 20) : modelId;
}

async function aggregateJsonlFile(
  filePath: string,
  acc: Map<string, ModelUsageStat>,
  seen: Set<string>
): Promise<void> {
  return new Promise((resolve) => {
    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream(filePath, { encoding: "utf-8" });
    } catch {
      resolve();
      return;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line) return;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "assistant") return;
        const msg = entry.message;
        if (!msg?.model || !msg?.usage) return;
        const reqId = entry.requestId as string | undefined;
        if (reqId) {
          if (seen.has(reqId)) return;
          seen.add(reqId);
        }
        const { model } = msg;
        const u = msg.usage as Record<string, number>;
        const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        const outputTokens = u.output_tokens ?? 0;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cacheCreation = u.cache_creation_input_tokens ?? 0;
        const existing = acc.get(model);
        if (existing) {
          existing.inputTokens += inputTokens;
          existing.outputTokens += outputTokens;
          existing.cacheRead += cacheRead;
          existing.cacheCreation += cacheCreation;
          existing.requests += 1;
          existing.totalTokens += inputTokens + outputTokens;
        } else {
          acc.set(model, {
            id: model,
            name: normalizeModelName(model),
            inputTokens,
            outputTokens,
            cacheRead,
            cacheCreation,
            requests: 1,
            totalTokens: inputTokens + outputTokens,
          });
        }
      } catch {
        /* skip malformed lines */
      }
    });
    rl.on("close", resolve);
    rl.on("error", () => resolve());
  });
}

export async function parseModelUsage(): Promise<ModelUsage> {
  const claudeProjectsPath = `${process.env.HOME}/.claude/projects`;
  const acc = new Map<string, ModelUsageStat>();
  const seen = new Set<string>();

  let projects: string[];
  try {
    projects = await readdir(claudeProjectsPath);
  } catch {
    return { models: [], total: { inputTokens: 0, outputTokens: 0, requests: 0 } };
  }

  for (const project of projects) {
    const projectDir = path.join(claudeProjectsPath, project);
    let entries: string[];
    try {
      const s = await stat(projectDir);
      if (!s.isDirectory()) continue;
      entries = await readdir(projectDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.endsWith(".jsonl")) {
        await aggregateJsonlFile(path.join(projectDir, entry), acc, seen);
      } else {
        // session dir — check for subagents/
        const subagentsDir = path.join(projectDir, entry, "subagents");
        let saFiles: string[];
        try {
          saFiles = await readdir(subagentsDir);
        } catch {
          continue;
        }
        for (const saFile of saFiles) {
          if (saFile.endsWith(".jsonl")) {
            await aggregateJsonlFile(path.join(subagentsDir, saFile), acc, seen);
          }
        }
      }
    }
  }

  const models = Array.from(acc.values())
    .filter((m) => m.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens);
  const total = models.reduce(
    (t, m) => ({
      inputTokens: t.inputTokens + m.inputTokens,
      outputTokens: t.outputTokens + m.outputTokens,
      requests: t.requests + m.requests,
    }),
    { inputTokens: 0, outputTokens: 0, requests: 0 }
  );

  return { models, total };
}
