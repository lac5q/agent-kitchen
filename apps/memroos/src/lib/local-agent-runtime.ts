import { execFileSync } from "child_process";
import type { AgentPlatform } from "@/types";

interface ProcessRow {
  pid: number;
  ppid: number;
  command: string;
}

interface AgentCliProcess extends ProcessRow {
  platform: AgentPlatform;
}

export interface LocalAgentRuntimeSummary {
  activeCliCount: number;
  byPlatform: Partial<Record<AgentPlatform, number>>;
  scannedAt: string;
}

const SHELL_WRAPPER_RE = /(?:^|\s)(?:\/bin\/(?:ba|z)?sh|bash|zsh|sh)\s+-c\s/i;
const DESKTOP_APP_RE = /\/Applications\/(?:Claude|Codex)\.app\/|(?:^|\s)\.\/Codex Computer Use\.app\//i;

function parsePsOutput(output: string): ProcessRow[] {
  return output
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3],
    }));
}

function isDirectCliProcess(command: string): boolean {
  return !SHELL_WRAPPER_RE.test(command) && !DESKTOP_APP_RE.test(command) && !command.startsWith("tmux ");
}

function tokenBaseName(token: string | undefined): string {
  return (token ?? "")
    .replace(/^["']|["']$/g, "")
    .split("/")
    .pop()
    ?.toLowerCase() ?? "";
}

function isDirectExecutable(command: string, names: string[]): boolean {
  const [executable, firstArg] = command.trim().split(/\s+/, 2);
  const executableName = tokenBaseName(executable);
  if (names.includes(executableName)) return true;
  if ((executableName === "node" || executableName === "bun") && names.includes(tokenBaseName(firstArg))) {
    return true;
  }
  return false;
}

function detectCliPlatform(command: string): AgentPlatform | null {
  if (!isDirectCliProcess(command)) return null;
  if (/\bhermes_cli\.main\b|(?:^|\s)(?:\S*\/)?hermes(?:\s|$)/i.test(command)) return "hermes";
  if (/\bopenclaw\/dist\/index\.js\b|\/node_modules\/openclaw\//i.test(command)) return "openclaw";
  if (isDirectExecutable(command, ["qwen"])) return "qwen";
  if (isDirectExecutable(command, ["pi"])) return "pi";
  if (isDirectExecutable(command, ["claude"])) return "claude";
  if (isDirectExecutable(command, ["codex"])) return "codex";
  if (isDirectExecutable(command, ["gemini"])) return "gemini";
  if (isDirectExecutable(command, ["opencode", "opencode-ai"])) return "opencode";
  if (isDirectExecutable(command, ["zcode"])) return "zcode";
  if (isDirectExecutable(command, ["openclaw"])) return "openclaw";
  return null;
}

export function summarizeAgentCliProcesses(
  psOutput: string,
  scannedAt = new Date().toISOString()
): LocalAgentRuntimeSummary {
  const candidates = parsePsOutput(psOutput).flatMap((processRow): AgentCliProcess[] => {
    const platform = detectCliPlatform(processRow.command);
    return platform ? [{ ...processRow, platform }] : [];
  });
  const candidatesByPid = new Map(candidates.map((processRow) => [processRow.pid, processRow]));
  const sessionRoots = candidates.filter((processRow) => {
    const parent = candidatesByPid.get(processRow.ppid);
    return !parent || parent.platform !== processRow.platform;
  });

  const byPlatform: Partial<Record<AgentPlatform, number>> = {};
  for (const processRow of sessionRoots) {
    byPlatform[processRow.platform] = (byPlatform[processRow.platform] ?? 0) + 1;
  }

  return {
    activeCliCount: sessionRoots.length,
    byPlatform,
    scannedAt,
  };
}

export function getLocalAgentRuntime(): LocalAgentRuntimeSummary {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf-8",
      timeout: 2000,
    });
    return summarizeAgentCliProcesses(output);
  } catch {
    return {
      activeCliCount: 0,
      byPlatform: {},
      scannedAt: new Date().toISOString(),
    };
  }
}
