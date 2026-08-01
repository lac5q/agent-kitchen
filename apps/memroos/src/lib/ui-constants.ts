export const POLL_INTERVALS = {
  agents: 15000,
  tokens: 30000,
  memory: 15000,
  knowledge: 60000,
  health: 30000,
  skills: 60000,
  hive: 15000,
  paperclip: 15000,
  voice: 2000,
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
  claude: "Claude Code",
  cowork: "Claude Cowork",
  cline: "Cline",
  cursor: "Cursor",
  codex: "Codex",
  qwen: "Qwen",
  pi: "Pi",
  gemini: "Gemini",
  opencode: "OpenCode",
  zcode: "ZCode",
  cortex: "Cortex",
  hermes: "Hermes",
  openclaw: "OpenClaw",
  chatgpt: "ChatGPT",
  grok: "Grok",
  droid: "Droid",
};
