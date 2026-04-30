import fs from "fs";
import path from "path";
import { resolveFromRepoRoot } from "@/lib/paths";
import type {
  ToolAttentionCapability,
  ToolAttentionOutcome,
  ToolAttentionRecommendation,
  ToolAttentionResponse,
  ToolAttentionSource,
  ToolAttentionSummary,
} from "@/types";

function now() {
  return new Date().toISOString();
}

function catalogPath() {
  return process.env.TOOL_ATTENTION_CATALOG || resolveFromRepoRoot("services/knowledge-mcp/tool-catalog.json");
}

function outcomesPath() {
  return process.env.TOOL_ATTENTION_OUTCOMES || resolveFromRepoRoot("logs/tool-attention-outcomes.jsonl");
}

function readJsonFile(filePath: string): { capabilities: ToolAttentionCapability[]; sources: ToolAttentionSource[] } {
  try {
    if (!fs.existsSync(filePath)) return { capabilities: [], sources: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };
  } catch {
    return { capabilities: [], sources: [] };
  }
}

function readOutcomes(filePath: string, limit = 20): ToolAttentionOutcome[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as ToolAttentionOutcome)
      .reverse();
  } catch {
    return [];
  }
}

function capability(input: ToolAttentionCapability): ToolAttentionCapability {
  return input;
}

function mcpCapabilities(): { capabilities: ToolAttentionCapability[]; sources: ToolAttentionSource[] } {
  const mcpPath = resolveFromRepoRoot(".mcp.json");
  const source: ToolAttentionSource = {
    id: "root-mcp-json",
    label: ".mcp.json",
    type: "local-config",
    path: mcpPath,
    status: fs.existsSync(mcpPath) ? "available" : "missing",
  };

  if (!fs.existsSync(mcpPath)) return { capabilities: [], sources: [source] };
  try {
    const parsed = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    const servers = Object.keys(parsed.mcpServers ?? {}).sort();
    return {
      sources: [source],
      capabilities: servers.map((server) =>
        capability({
          id: `mcp-server:${server}`,
          name: server,
          type: "mcp-server",
          source: "root-mcp-json",
          description: `Configured MCP server ${server} from the monorepo root MCP config.`,
          status: "available",
          tags: ["mcp", "configured"],
          useWhen: [`Need tools exposed by the ${server} MCP server.`],
          topLevel: true,
          loadCommand: `Use MCP server ${server}`,
        })
      ),
    };
  } catch {
    return { capabilities: [], sources: [{ ...source, status: "invalid" }] };
  }
}

function knowledgeCapabilities(): ToolAttentionCapability[] {
  const coreTools = [
    "knowledge_health",
    "knowledge_manifest",
    "knowledge_search",
    "knowledge_read",
    "memory_search",
    "memory_save",
  ];
  const workspaces = [
    ["agent-memory", "Durable agent memory workspace for preferences, lessons, and cross-session facts."],
    ["admin", "Admin workspace for health aggregation and source manifests."],
    ["dashboard", "Dashboard workspace exposing public-safe manifests for UI templates."],
    ["graph", "Compiled knowledge graph workspace for relationship inspection."],
    ["ingestion", "Open Brain import recipes for private exports and source metadata."],
    ["integrations", "External capture and deployment connection workspace."],
    ["primitives", "Reusable low-level provenance and dedupe patterns."],
    ["skill-packs", "Reusable agent skill package workspace."],
    ["tool-attention", "Progressive MCP/tool discovery and outcome recording."],
    ["vector", "Semantic retrieval workspace for vector-backed search adapters."],
    ["wiki", "Compiled wiki maintenance and inspection workspace."],
    ["workflows", "Open Brain operating workflow workspace."],
  ];

  return [
    ...coreTools.map((tool) =>
      capability({
        id: `knowledge-core:${tool}`,
        name: tool,
        type: "mcp-tool",
        source: "knowledge-system",
        description: `Core knowledge-system MCP tool ${tool}.`,
        status: "available",
        tags: ["knowledge", "core", "mcp"],
        useWhen: [],
        topLevel: true,
        loadCommand: tool,
      })
    ),
    ...workspaces.map(([workspace, description]) =>
      capability({
        id: `knowledge-workspace:${workspace}`,
        name: workspace,
        type: "workspace",
        source: "knowledge-system",
        description,
        status: "available",
        tags: ["knowledge", "workspace", "progressive"],
        useWhen: [`Need the ${workspace} progressive workspace.`],
        topLevel: false,
        loadCommand: `knowledge_open_workspace("${workspace}")`,
      })
    ),
  ];
}

function skillCapabilities(): { capabilities: ToolAttentionCapability[]; sources: ToolAttentionSource[] } {
  const skillsPath = process.env.SKILLS_PATH || `${process.env.HOME}/.claude/skills`;
  const source: ToolAttentionSource = {
    id: "skills-path",
    label: "Kitchen-visible skills",
    type: "skills",
    path: skillsPath,
    status: fs.existsSync(skillsPath) ? "available" : "missing",
  };

  try {
    if (!fs.existsSync(skillsPath)) return { capabilities: [], sources: [source] };
    const capabilities = fs
      .readdirSync(skillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) =>
        capability({
          id: `skill:${entry.name}`,
          name: entry.name,
          type: "skill",
          source: "skills-path",
          description: `Agent skill ${entry.name}.`,
          status: "available",
          tags: ["skill", "agent-context"],
          useWhen: [`Need the ${entry.name} reusable agent skill.`],
          topLevel: false,
          loadCommand: path.join(skillsPath, entry.name, "SKILL.md"),
        })
      );
    return { capabilities, sources: [source] };
  } catch {
    return { capabilities: [], sources: [{ ...source, status: "degraded" }] };
  }
}

function summarize(
  capabilities: ToolAttentionCapability[],
  sources: ToolAttentionSource[],
  outcomes: ToolAttentionOutcome[]
): ToolAttentionSummary {
  return {
    totalCapabilities: capabilities.length,
    topLevelTools: capabilities.filter((item) => item.topLevel).length,
    workspaces: capabilities.filter((item) => item.type === "workspace").length,
    sources: sources.length,
    recentOutcomes: outcomes.length,
  };
}

function recommendations(capabilities: ToolAttentionCapability[]): ToolAttentionRecommendation[] {
  const preferred = [
    "knowledge-workspace:tool-attention",
    "mcp-server:knowledge-system",
    "knowledge-workspace:agent-memory",
    "mcp-server:gitnexus",
  ];
  const byId = new Map(capabilities.map((item) => [item.id, item]));
  return preferred
    .filter((id) => byId.has(id))
    .map((id) => ({
      capabilityId: id,
      title: byId.get(id)?.name ?? id,
      reason: "High-leverage starting point for progressive discovery.",
    }));
}

function matchesQuery(item: ToolAttentionCapability, query: string): boolean {
  if (!query.trim()) return true;
  const normalized = query.toLowerCase();
  return [
    item.id,
    item.name,
    item.type,
    item.source,
    item.description,
    item.tags.join(" "),
    item.useWhen.join(" "),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function getToolAttention(query = "", limit = 25): ToolAttentionResponse {
  const mcp = mcpCapabilities();
  const skills = skillCapabilities();
  const curated = readJsonFile(catalogPath());
  const outcomes = readOutcomes(outcomesPath());
  const capabilities = [
    ...mcp.capabilities,
    ...knowledgeCapabilities(),
    ...skills.capabilities,
    ...curated.capabilities,
  ].filter((item) => matchesQuery(item, query)).slice(0, Math.max(1, Math.min(limit, 100)));
  const sources = [...mcp.sources, {
    id: "knowledge-system",
    label: "Knowledge MCP",
    type: "service",
    path: resolveFromRepoRoot("services/knowledge-mcp"),
    status: "available",
  }, ...skills.sources, ...curated.sources];
  const uniqueSources = Array.from(new Map(sources.map((source) => [source.id, source])).values());
  const healthMessages = [];
  if (!fs.existsSync(catalogPath())) healthMessages.push("Optional curated tool catalog is missing.");
  if (!fs.existsSync(outcomesPath())) healthMessages.push("No tool outcome log has been recorded yet.");

  return {
    summary: summarize(capabilities, uniqueSources, outcomes),
    capabilities,
    recentOutcomes: outcomes,
    recommendations: recommendations(capabilities),
    sources: uniqueSources,
    health: {
      status: fs.existsSync(catalogPath()) ? "ok" : "degraded",
      catalogPath: catalogPath(),
      outcomesPath: outcomesPath(),
      messages: healthMessages,
    },
    timestamp: now(),
  };
}
