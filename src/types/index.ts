export type AgentStatus = "active" | "idle" | "dormant" | "error";
export type AgentPlatform = "claude" | "codex" | "qwen" | "gemini" | "opencode";

export interface Agent {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  status: AgentStatus;
  lastHeartbeat: string | null;
  currentTask: string | null;
  lessonsCount: number;
  todayMemoryCount: number;
  location?: "local" | "tailscale" | "cloudflare";
  isRemote?: boolean;
  latencyMs?: number | null;
  agentKind?: "agentic" | "devtool";
  icon?: string;
}

export interface TokenStats {
  totalInput: number;
  totalOutput: number;
  tokensSaved: number;
  savingsPercent: number;
  totalCommands: number;
  avgExecutionTime: number;
  commandBreakdown: CommandSavings[];
}

export interface CommandSavings {
  command: string;
  count: number;
  tokensUsed: number;
  tokensSaved: number;
}

export interface MemoryEntry {
  id: string;
  content: string;
  agent: string;
  date: string;
  type: "user" | "feedback" | "project" | "reference" | "daily";
  source: string;
  score?: number;
}

export interface KnowledgeCollection {
  name: string;
  docCount: number;
  category: "business" | "agents" | "marketing" | "product" | "other";
  lastUpdated: string | null;
  basePath?: string;
}

export interface HealthStatus {
  service: string;
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
  lastCheck: string;
}

export interface FlowNode {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  x: number;
  y: number;
  status: "active" | "idle" | "error";
  stats: Record<string, string | number>;
}

export interface FlowEdge {
  from: string;
  to: string;
  type: "request" | "knowledge" | "memory" | "error" | "apo";
}

export type AgentLocation = "local" | "tailscale" | "cloudflare";

export interface RemoteAgentConfig {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  location: AgentLocation;
  host: string;
  port: number;
  healthEndpoint: string;
  tunnelUrl?: string;
}

export interface ApoProposal {
  id: string;
  filename: string;
  skill: string;
  subsystem: string;
  timestamp: string;
  content: string;
  status: "pending" | "archived";
}

export interface ApoCycleStats {
  lastRun: string | null;
  totalProposals: number;
  pendingProposals: number;
  archivedProposals: number;
  recentLogLines: string[];
}
