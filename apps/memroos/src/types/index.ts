export type AgentStatus = "active" | "idle" | "dormant" | "error";
export type AgentPlatform =
  | "cursor"
  | "claude"
  | "codex"
  | "qwen"
  | "gemini"
  | "opencode"
  | "hermes"
  | "openclaw"
  | "chatgpt";
export type AgentProtocol = "rest" | "a2a" | "ui" | "local";

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
  detail?: string;
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
  protocol?: AgentProtocol;
  location: AgentLocation;
  host: string;
  port: number;
  healthEndpoint: string;
  tunnelUrl?: string;
  skills?: AgentCardSkill[];
  metadata?: Record<string, unknown>;
}

export interface RegisteredAgentCapability {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface RegisteredAgent extends Agent {
  protocol: AgentProtocol;
  capabilities: RegisteredAgentCapability[];
  metadata: Record<string, unknown>;
  host: string | null;
  port: number | null;
  healthEndpoint: string | null;
  tunnelUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deregisteredAt: string | null;
}

export interface RegisterAgentInput {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  protocol: AgentProtocol;
  company?: string;
  location?: AgentLocation;
  host?: string | null;
  port?: number | null;
  healthEndpoint?: string | null;
  tunnelUrl?: string | null;
  capabilities?: RegisteredAgentCapability[];
  metadata?: Record<string, unknown>;
  issueApiKey?: boolean;
}

export interface RegisterAgentResult {
  agent: RegisteredAgent;
  apiKey?: string;
}

export interface AgentHeartbeatInput {
  status?: AgentStatus;
  currentTask?: string | null;
  latencyMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ApoProposal {
  id: string;
  filename: string;
  skill: string;
  subsystem: string;
  timestamp: string;
  content: string;
  status: "pending" | "approved" | "archived";
  tracking?: ApoProposalTracking;
}

export interface ApoProposalTracking {
  phase: "pending" | "queued" | "implemented";
  label: string;
  description: string;
  timestamp: string;
  approvedAt?: string;
  implementedAt?: string;
  archivedAt?: string;
  targetPath?: string;
  targetKind?: "skill" | "agent";
  executorCli?: string;
  applied?: boolean;
}

export interface ApoCycleStats {
  lastRun: string | null;
  totalProposals: number;
  pendingProposals: number;
  approvedProposals: number;
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

export interface ToolAttentionContextPack {
  task_type?: string;
  repo?: string;
  agent_id?: string;
  tags?: string[];
}

export interface ToolAttentionOutcomeSummary {
  toolId: string;
  uses: number;
  successes: number;
  failures: number;
  score: number;
  lastOutcome: string;
  lastUsedAt: string;
}

export interface SimilarTaskRecommendation {
  capabilityId: string;
  name: string;
  description: string;
  type: string;
  contextScore: number;
  overallScore: number;
  reason: string;
}

export interface SimilarTaskResponse {
  context: ToolAttentionContextPack;
  recommendations: SimilarTaskRecommendation[];
  timestamp: string;
}

export interface ToolAttentionCapability {
  id: string;
  name: string;
  type: string;
  category?: string;
  source: string;
  description: string;
  status: "available" | "candidate" | "missing" | "invalid" | "degraded";
  tags: string[];
  useWhen: string[];
  topLevel: boolean;
  loadCommand: string | null;
  outcomeSummary?: ToolAttentionOutcomeSummary;
}

export interface ToolAttentionSource {
  id: string;
  label: string;
  type: string;
  path?: string;
  status: string;
}

export interface ToolAttentionOutcome {
  timestamp: string;
  toolId: string;
  task: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}

export interface ToolAttentionSummary {
  totalCapabilities: number;
  topLevelTools: number;
  workspaces: number;
  sources: number;
  recentOutcomes: number;
}

export interface ToolAttentionRecommendation {
  capabilityId: string;
  title: string;
  reason: string;
}

export interface ToolAttentionResponse {
  summary: ToolAttentionSummary;
  capabilities: ToolAttentionCapability[];
  recentOutcomes: ToolAttentionOutcome[];
  recommendations: ToolAttentionRecommendation[];
  sources: ToolAttentionSource[];
  health: {
    status: "ok" | "degraded";
    catalog: "available" | "missing";
    outcomes: "available" | "missing";
    messages: string[];
  };
  timestamp: string;
}
