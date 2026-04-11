import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

type WireStatus = "connected" | "partial" | "not-wired";

interface DevToolStatus {
  id: string;
  name: string;
  mem0: WireStatus;
  qmd: WireStatus;
  overall: WireStatus;
}

async function readJSON(filePath: string): Promise<Record<string, unknown>> {
  try {
    const home = process.env.HOME ?? "";
    const resolved = path.resolve(filePath.replace(/^~/, home));
    // Guard: resolved path must stay within home directory
    if (!resolved.startsWith(home + path.sep)) {
      return {};
    }
    const raw = await readFile(resolved, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readTOML(filePath: string): Promise<string> {
  try {
    const home = process.env.HOME ?? "";
    const resolved = path.resolve(filePath.replace(/^~/, home));
    // Guard: resolved path must stay within home directory
    if (!resolved.startsWith(home + path.sep)) {
      return "";
    }
    return await readFile(resolved, "utf-8");
  } catch {
    return "";
  }
}

function hasKeyInMCPServers(mcpServers: Record<string, unknown>, key: string): boolean {
  return Object.keys(mcpServers).some(k => k.toLowerCase().includes(key));
}

function computeOverall(mem0: WireStatus, qmd: WireStatus): WireStatus {
  const wired = [mem0, qmd].filter(s => s === "connected").length;
  if (wired === 2) return "connected";
  if (wired === 1) return "partial";
  return "not-wired";
}

export async function GET() {
  const results: DevToolStatus[] = [];

  // Claude Code — ~/.claude/settings.json
  const claudeSettings = await readJSON("~/.claude/settings.json");
  const claudeMCPs = (claudeSettings.mcpServers as Record<string, unknown>) || {};
  const claudeMem0: WireStatus = hasKeyInMCPServers(claudeMCPs, "mem0") ? "connected" : "not-wired";
  const claudeQmd: WireStatus = hasKeyInMCPServers(claudeMCPs, "qmd") ? "connected" : "not-wired";
  results.push({
    id: "claude-code",
    name: "Claude Code",
    mem0: claudeMem0,
    qmd: claudeQmd,
    overall: computeOverall(claudeMem0, claudeQmd),
  });

  // Qwen CLI — ~/.qwen/settings.json
  const qwenSettings = await readJSON("~/.qwen/settings.json");
  const qwenMCPs = (qwenSettings.mcpServers as Record<string, unknown>) || {};
  const qwenMem0: WireStatus = hasKeyInMCPServers(qwenMCPs, "mem0") ? "connected" : "not-wired";
  const qwenQmd: WireStatus = hasKeyInMCPServers(qwenMCPs, "qmd") ? "connected" : "not-wired";
  results.push({
    id: "qwen-cli",
    name: "Qwen CLI",
    mem0: qwenMem0,
    qmd: qwenQmd,
    overall: computeOverall(qwenMem0, qwenQmd),
  });

  // Gemini CLI — ~/.gemini/settings.json
  const geminiSettings = await readJSON("~/.gemini/settings.json");
  const geminiMCPs = (geminiSettings.mcpServers as Record<string, unknown>) || {};
  const geminiMem0: WireStatus = hasKeyInMCPServers(geminiMCPs, "mem0") ? "connected" : "not-wired";
  const geminiQmd: WireStatus = hasKeyInMCPServers(geminiMCPs, "qmd") ? "connected" : "not-wired";
  results.push({
    id: "gemini-cli",
    name: "Gemini CLI",
    mem0: geminiMem0,
    qmd: geminiQmd,
    overall: computeOverall(geminiMem0, geminiQmd),
  });

  // Codex — ~/.codex/config.toml
  const codexTOML = await readTOML("~/.codex/config.toml");
  const codexMem0: WireStatus = codexTOML.includes("[mcp_servers.mem0]") ? "connected" : "not-wired";
  const codexQmd: WireStatus = codexTOML.includes("[mcp_servers.qmd]") ? "connected" : "not-wired";
  results.push({
    id: "codex",
    name: "Codex",
    mem0: codexMem0,
    qmd: codexQmd,
    overall: computeOverall(codexMem0, codexQmd),
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
