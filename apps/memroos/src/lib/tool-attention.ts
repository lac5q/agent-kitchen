import fs from "fs";
import path from "path";
import { resolveFromRepoRoot } from "@/lib/paths";
import type {
  ToolAttentionCapability,
  ToolAttentionContextPack,
  ToolAttentionOutcome,
  ToolAttentionOutcomeSummary,
  ToolAttentionRecommendation,
  ToolAttentionResponse,
  ToolAttentionSource,
  ToolAttentionSummary,
  SimilarTaskRecommendation,
  SimilarTaskResponse,
} from "@/types";

function now() {
  return new Date().toISOString();
}

const SUCCESS_OUTCOMES = new Set(["helped", "success", "successful", "useful", "pass", "passed", "worked"]);
const FAILURE_OUTCOMES = new Set(["failed", "failure", "not_helpful", "not helpful", "miss", "error", "blocked"]);
const SUPPORTED_OPTIONAL_CAPABILITIES = new Set(["gitnexus", "agent-lightning"]);

function optionalCapabilities(): Set<string> {
  return new Set(
    (process.env.MEMROOS_OPTIONAL_CAPABILITIES ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => SUPPORTED_OPTIONAL_CAPABILITIES.has(item))
  );
}

function gitnexusStatus(): ToolAttentionCapability["status"] {
  const registryPath = process.env.GITNEXUS_REGISTRY || `${process.env.HOME}/.gitnexus/registry.json`;
  const hasRegistry = fs.existsSync(registryPath);
  const mcpPath = resolveFromRepoRoot(".mcp.json");
  let hasMcp = false;
  try {
    hasMcp = Boolean(JSON.parse(fs.readFileSync(mcpPath, "utf-8")).mcpServers?.gitnexus);
  } catch {
    hasMcp = false;
  }
  if (hasMcp && hasRegistry) return "available";
  if (hasMcp || hasRegistry) return "degraded";
  return "missing";
}

function agentLightningStatus(): ToolAttentionCapability["status"] {
  const proposalsPath = process.env.APO_PROPOSALS_PATH || `${process.env.HOME}/.openclaw/skills/proposals`;
  const cronLogPath = process.env.APO_CRON_LOG_PATH || `${process.env.HOME}/.openclaw/logs/agent-lightning-cron.log`;
  let hasWorker = false;
  try {
    const packageJson = JSON.parse(fs.readFileSync(resolveFromRepoRoot("apps/memroos/package.json"), "utf-8"));
    hasWorker = Boolean(packageJson.scripts?.["apo:worker"]);
  } catch {
    hasWorker = false;
  }
  if (hasWorker && fs.existsSync(proposalsPath) && fs.existsSync(cronLogPath)) return "available";
  if (hasWorker || fs.existsSync(proposalsPath) || fs.existsSync(cronLogPath)) return "degraded";
  return "missing";
}

function contextMatchSignal(outcome: ToolAttentionOutcome, context: ToolAttentionContextPack): number {
  let score = 0;
  const meta = outcome.metadata ?? {};
  if (context.task_type && meta.task_type === context.task_type) score += 2;
  if (context.repo && meta.repo === context.repo) score += 2;
  if (context.agent_id && meta.agent_id === context.agent_id) score += 1;
  for (const tag of context.tags ?? []) {
    if ((meta.tags as string[] ?? []).includes(tag)) score += 1;
  }
  return score;
}

function buildOutcomeSummaries(outcomes: ToolAttentionOutcome[]): Map<string, ToolAttentionOutcomeSummary> {
  const map = new Map<string, ToolAttentionOutcomeSummary>();
  for (const outcome of outcomes) {
    const toolId = String(outcome.toolId ?? "");
    if (!toolId) continue;
    const label = String(outcome.outcome ?? "").trim().toLowerCase();
    let entry = map.get(toolId);
    if (!entry) {
      entry = { toolId, uses: 0, successes: 0, failures: 0, score: 0, lastOutcome: "", lastUsedAt: "" };
      map.set(toolId, entry);
    }
    entry.uses += 1;
    if (SUCCESS_OUTCOMES.has(label)) { entry.successes += 1; entry.score += 2; }
    else if (FAILURE_OUTCOMES.has(label)) { entry.failures += 1; entry.score -= 2; }
    else { entry.score += 1; }
    if (!entry.lastUsedAt) {
      entry.lastUsedAt = String(outcome.timestamp ?? "");
      entry.lastOutcome = String(outcome.outcome ?? "");
    }
  }
  return map;
}

export function getSimilarTaskRecommendations(
  context: ToolAttentionContextPack,
  limit = 10,
): SimilarTaskResponse {
  const data = getToolAttention("", 100);
  const outcomes = data.recentOutcomes;
  const outcomeSummaries = buildOutcomeSummaries(outcomes);

  const contextScoreByTool = new Map<string, number>();
  for (const outcome of outcomes) {
    const toolId = String(outcome.toolId ?? "");
    if (!toolId) continue;
    const delta = contextMatchSignal(outcome, context);
    contextScoreByTool.set(toolId, (contextScoreByTool.get(toolId) ?? 0) + delta);
  }

  const recommendations: SimilarTaskRecommendation[] = [];
  for (const cap of data.capabilities) {
    const contextScore = contextScoreByTool.get(cap.id) ?? 0;
    const summary = outcomeSummaries.get(cap.id);
    const outcomeScore = summary?.score ?? 0;
    if (contextScore === 0 && outcomeScore <= 0) continue;
    const overallScore = outcomeScore + contextScore * 3;
    const reasonParts: string[] = [];
    if (contextScore > 0) reasonParts.push(`context match score ${contextScore}`);
    if (summary?.uses) reasonParts.push(`${summary.uses} recorded outcome(s) with score ${outcomeScore}`);
    recommendations.push({
      capabilityId: cap.id,
      name: cap.name,
      description: cap.description,
      type: cap.type,
      contextScore,
      overallScore,
      reason: reasonParts.join("; ") || "Outcome signal present.",
    });
  }

  recommendations.sort((a, b) => b.overallScore - a.overallScore);
  return {
    context,
    recommendations: recommendations.slice(0, Math.max(1, Math.min(limit, 100))),
    timestamp: now(),
  };
}

function catalogPath() {
  return process.env.TOOL_ATTENTION_CATALOG || resolveFromRepoRoot("services/knowledge-mcp/tool-catalog.json");
}

function outcomesPath() {
  return process.env.TOOL_ATTENTION_OUTCOMES || resolveFromRepoRoot("logs/tool-attention-outcomes.jsonl");
}

function publicPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  if (/^https?:\/\//.test(filePath)) return filePath;
  if (!path.isAbsolute(filePath)) return filePath;

  const resolved = path.resolve(filePath);
  const repoRoot = resolveFromRepoRoot(".");
  const repoRelative = path.relative(repoRoot, resolved);
  if (repoRelative && !repoRelative.startsWith("..") && !path.isAbsolute(repoRelative)) {
    return repoRelative;
  }

  const home = process.env.HOME ? path.resolve(process.env.HOME) : "";
  if (home) {
    const homeRelative = path.relative(home, resolved);
    if (homeRelative && !homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)) {
      return `~/${homeRelative}`;
    }
  }

  return path.basename(filePath);
}

function publicSource(source: ToolAttentionSource): ToolAttentionSource {
  return {
    ...source,
    path: publicPath(source.path),
  };
}

function publicCapability(item: ToolAttentionCapability): ToolAttentionCapability {
  return {
    ...item,
    loadCommand: publicLoadCommand(item.loadCommand),
  };
}

function publicLoadCommand(command: string | null): string | null {
  if (!command) return command;
  const repoRoot = resolveFromRepoRoot(".");
  if (command.includes(repoRoot)) {
    return command.replaceAll(repoRoot, ".");
  }
  const home = process.env.HOME ? path.resolve(process.env.HOME) : "";
  if (home && command.includes(home)) {
    return command.replaceAll(home, "~");
  }
  return command;
}

function readJsonFile(filePath: string): { capabilities: ToolAttentionCapability[]; sources: ToolAttentionSource[] } {
  try {
    if (!fs.existsSync(filePath)) return { capabilities: [], sources: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities.map(publicCapability) : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources.map(publicSource) : [],
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

export function appendToolAttentionOutcome(outcome: ToolAttentionOutcome): void {
  const filePath = outcomesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(outcome)}\n`, "utf-8");
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
    const optional = optionalCapabilities();
    return {
      sources: [source],
      capabilities: servers.map((server) =>
        capability({
          id: `mcp-server:${server}`,
          name: server,
          type: "mcp-server",
          source: "root-mcp-json",
          description: `Configured MCP server ${server} from the monorepo root MCP config.`,
          status: server === "gitnexus" && optional.has("gitnexus") ? gitnexusStatus() : "available",
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

function optionalCapabilityEntries(): ToolAttentionCapability[] {
  const optional = optionalCapabilities();
  if (!optional.has("agent-lightning")) return [];
  return [
    capability({
      id: "capability:agent-lightning",
      name: "agent-lightning",
      type: "capability",
      category: "capability",
      source: "optional-capabilities",
      description: "Agent Lightning/APO proposal review and approved-skill-improvement workflow.",
      status: agentLightningStatus(),
      tags: ["agent-lightning", "apo", "skills", "proposals", "progressive"],
      useWhen: [
        "Need to review or process APO skill-improvement proposals",
        "Need human-gated self-learning changes to skills or agent instructions",
        "Need Agent Lightning approval worker guidance",
      ],
      topLevel: false,
      loadCommand: "Use /apo or npm --prefix apps/memroos run apo:worker",
    }),
  ];
}

function knowledgeCapabilities(): ToolAttentionCapability[] {
  const coreTools = [
    "knowledge_health",
    "report_issue",
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
    label: "Memroos-visible skills",
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
          loadCommand: `Read skill ${entry.name}`,
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
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    item.id,
    item.name,
    item.type,
    item.source,
    item.description,
    item.tags.join(" "),
    item.useWhen.join(" "),
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function getToolAttention(query = "", limit = 25): ToolAttentionResponse {
  const mcp = mcpCapabilities();
  const skills = skillCapabilities();
  const curated = readJsonFile(catalogPath());
  const outcomes = readOutcomes(outcomesPath());
  const optionalEntries = optionalCapabilityEntries();
  const capabilities = [
    ...mcp.capabilities,
    ...optionalEntries,
    ...knowledgeCapabilities(),
    ...skills.capabilities,
    ...curated.capabilities,
  ].map(publicCapability).filter((item) => matchesQuery(item, query)).slice(0, Math.max(1, Math.min(limit, 100)));
  const optionalSources: ToolAttentionSource[] = optionalEntries.length ? [{
    id: "optional-capabilities",
    label: "Optional Progressive Capabilities",
    type: "local-config",
    path: ".env",
    status: "available",
  }] : [];
  const sources = [...mcp.sources, ...optionalSources, {
    id: "knowledge-system",
    label: "Knowledge MCP",
    type: "service",
    path: resolveFromRepoRoot("services/knowledge-mcp"),
    status: "available",
  }, ...skills.sources, ...curated.sources];
  const uniqueSources = Array.from(new Map(sources.map((source) => [source.id, publicSource(source)])).values());
  const healthMessages = [];
  const catalogExists = fs.existsSync(catalogPath());
  const outcomesExists = fs.existsSync(outcomesPath());
  if (!catalogExists) healthMessages.push("Optional curated tool catalog is missing.");
  if (!outcomesExists) healthMessages.push("No tool outcome log has been recorded yet.");

  return {
    summary: summarize(capabilities, uniqueSources, outcomes),
    capabilities,
    recentOutcomes: outcomes,
    recommendations: recommendations(capabilities),
    sources: uniqueSources,
    health: {
      status: catalogExists ? "ok" : "degraded",
      catalog: catalogExists ? "available" : "missing",
      outcomes: outcomesExists ? "available" : "missing",
      messages: healthMessages,
    },
    timestamp: now(),
  };
}
