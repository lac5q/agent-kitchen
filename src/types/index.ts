export type AgentStatus = "active" | "idle" | "dormant" | "error";
export type AgentPlatform = "claude" | "codex" | "qwen" | "gemini" | "opencode" | "hermes" | "openclaw";

export interface Agent {
  id: string;
  name: string;
  role: string;
  company?: string;
  platform: AgentPlatform;
  status: AgentStatus;
  lastHeartbeat: string | null;
  currentTask: string | null;
  lessonsCount: number;
  todayMemoryCount: number;
  location?: "local" | "tailscale" | "cloudflare";
  isRemote?: boolean;
  latencyMs?: number | null;
  masterId?: string;
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

export interface AgentCardSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: ["text"];
  outputModes: ["text"];
}

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
  skills?: AgentCardSkill[];
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

// Paperclip fleet types (Phase 21 — PAPER-02, PAPER-03, PAPER-04)

export type PaperclipAutonomyMode =
  | "Interactive"
  | "Autonomous"
  | "Continuous"
  | "Hybrid";

export interface PaperclipFleetSummary {
  fleetStatus: "active" | "degraded" | "offline";
  totalAgents: number;
  activeAgents: number;
  activeTasks: number;
  pausedRecoveries: number;
  autonomyMix: Record<PaperclipAutonomyMode, number>;
  lastHeartbeat: string | null;
}

export interface PaperclipFleetAgent {
  id: string;
  name: string;
  status: "active" | "idle" | "dormant" | "error";
  autonomyMode: PaperclipAutonomyMode;
  activeTask: string | null;
  lastHeartbeat: string | null;
}

export interface PaperclipOperation {
  taskId: string;
  sessionId: string;
  status: "pending" | "active" | "paused" | "completed" | "failed";
  summary: string;
  resumeFrom: string | null;
  completedSteps: string[];
  updatedAt: string;
}

export interface PaperclipFleetResponse {
  summary: PaperclipFleetSummary;
  agents: PaperclipFleetAgent[];
  operations: PaperclipOperation[];
  timestamp: string;
}
