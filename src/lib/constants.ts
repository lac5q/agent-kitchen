export const POLL_INTERVALS = {
  agents: 5000,
  tokens: 30000,
  memory: 15000,
  knowledge: 60000,
  health: 10000,
  skills: 60000,
} as const;

export const COLORS = {
  bg: "hsl(222.2, 84%, 4.9%)",
  accent: "#f59e0b",
  success: "#10b981",
  danger: "#f43f5e",
  info: "#0ea5e9",
  muted: "#64748b",
  cardBg: "hsl(222.2, 84%, 6.9%)",
} as const;

export const STATUS_COLORS: Record<string, string> = {
  active: COLORS.success,
  idle: COLORS.accent,
  dormant: COLORS.muted,
  error: COLORS.danger,
  up: COLORS.success,
  degraded: COLORS.accent,
  down: COLORS.danger,
};

export const PLATFORM_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  qwen: "Qwen",
  gemini: "Gemini",
  opencode: "OpenCode",
};

export const AGENT_CONFIGS_PATH = process.env.AGENT_CONFIGS_PATH || `${process.env.HOME}/github/knowledge/agent-configs`;
export const PMO_MEMORY_PATH = process.env.PMO_MEMORY_PATH || `${process.env.HOME}/github/PMO/memory`;
export const CLAUDE_MEMORY_PATH = process.env.CLAUDE_MEMORY_PATH || `${process.env.HOME}/.claude/projects`;
export const MEM0_URL = process.env.MEM0_URL || "http://localhost:3201";
export const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || `${process.env.HOME}/github/knowledge`;
export const CURATOR_LOG_PATH = process.env.CURATOR_LOG_PATH || "/tmp/knowledge-curator.log";
export const SKILLS_PATH = process.env.SKILLS_PATH ||
  `${process.env.HOME}/github/knowledge/skills`;
export const SKILL_CONTRIBUTIONS_LOG = process.env.SKILL_CONTRIBUTIONS_LOG ||
  `${process.env.HOME}/github/knowledge/skill-contributions.jsonl`;
export const FAILURES_LOG = process.env.FAILURES_LOG ||
  `${process.env.HOME}/.openclaw/failures.log`;
