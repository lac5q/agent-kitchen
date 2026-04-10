import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

type WireStatus = "connected" | "partial" | "not-wired";

interface DevToolStatus {
  id: string;
  name: string;
  mem0: WireStatus;
  qmd: WireStatus;
  overall: WireStatus;
}

async function readJSON(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path.replace("~", process.env.HOME || ""), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readTOML(path: string): Promise<string> {
  try {
    return await readFile(path.replace("~", process.env.HOME || ""), "utf-8");
  } catch {
    return "";
  }
}

function hasMem0InMCPServers(mcpServers: Record<string, unknown>): boolean {
  return Object.keys(mcpServers).some(k => k.toLowerCase().includes("mem0"));
}

export async function GET() {
  const results: DevToolStatus[] = [];

  // Claude Code — ~/.claude/settings.json
  const claudeSettings = await readJSON("~/.claude/settings.json");
  const claudeMCPs = (claudeSettings.mcpServers as Record<string, unknown>) || {};
  const claudeHasMem0 = hasMem0InMCPServers(claudeMCPs);
  // Also check for session hook as partial credit
  const claudeHasHook = await readFile(`${process.env.HOME}/.claude/hooks/mem0-session-preload.sh`, "utf-8")
    .then(() => true).catch(() => false);
  results.push({
    id: "claude-code",
    name: "Claude Code",
    mem0: claudeHasMem0 ? "connected" : claudeHasHook ? "partial" : "not-wired",
    qmd: "not-wired",
    overall: claudeHasMem0 ? "connected" : claudeHasHook ? "partial" : "not-wired",
  });

  // Qwen CLI — ~/.qwen/settings.json
  const qwenSettings = await readJSON("~/.qwen/settings.json");
  const qwenMCPs = (qwenSettings.mcpServers as Record<string, unknown>) || {};
  const qwenHasMem0 = hasMem0InMCPServers(qwenMCPs);
  results.push({
    id: "qwen-cli",
    name: "Qwen CLI",
    mem0: qwenHasMem0 ? "connected" : "not-wired",
    qmd: "not-wired",
    overall: qwenHasMem0 ? "partial" : "not-wired", // partial until QMD also wired
  });

  // Gemini CLI — ~/.gemini/settings.json
  const geminiSettings = await readJSON("~/.gemini/settings.json");
  const geminiMCPs = (geminiSettings.mcpServers as Record<string, unknown>) || {};
  const geminiHasMem0 = hasMem0InMCPServers(geminiMCPs);
  results.push({
    id: "gemini-cli",
    name: "Gemini CLI",
    mem0: geminiHasMem0 ? "connected" : "not-wired",
    qmd: "not-wired",
    overall: geminiHasMem0 ? "partial" : "not-wired",
  });

  // Codex — ~/.codex/config.toml
  const codexTOML = await readTOML("~/.codex/config.toml");
  const codexHasMem0 = codexTOML.includes("[mcp_servers.mem0]") || codexTOML.includes("mcp_servers.mem0");
  results.push({
    id: "codex",
    name: "Codex",
    mem0: codexHasMem0 ? "connected" : "not-wired",
    qmd: "not-wired",
    overall: codexHasMem0 ? "partial" : "not-wired",
  });

  // Verify mem0 is actually reachable
  const mem0Reachable = await fetch(`${process.env.MEM0_URL || "http://localhost:3201"}/health`, {
    signal: AbortSignal.timeout(1000),
  }).then(r => r.ok).catch(() => false);

  return NextResponse.json({
    tools: results,
    mem0Reachable,
    timestamp: new Date().toISOString(),
  });
}
