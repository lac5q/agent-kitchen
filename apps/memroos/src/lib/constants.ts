import { loadMemroosEnv } from "./env";

export { COLORS, PLATFORM_LABELS, POLL_INTERVALS, STATUS_COLORS } from "./ui-constants";

const env = loadMemroosEnv();

export const AGENT_CONFIGS_PATH = env.AGENT_CONFIGS_PATH;
export const PMO_MEMORY_PATH = env.PMO_MEMORY_PATH;
export const CLAUDE_MEMORY_PATH = env.CLAUDE_MEMORY_PATH;
export const QWEN_MEMORY_PATH = env.QWEN_MEMORY_PATH;
export const HERMES_MEMORY_PATH = env.HERMES_MEMORY_PATH;
export const CODEX_MEMORY_PATH = env.CODEX_MEMORY_PATH;
export const MEM0_URL = env.MEM0_URL;
export const SKILLS_PATH = env.SKILLS_PATH;
export const SKILL_CONTRIBUTIONS_LOG = env.SKILL_CONTRIBUTIONS_LOG;
export const FAILURES_LOG = env.FAILURES_LOG;

// SQLite conversation store path — resolved relative to the monorepo root in db.ts
// Keep as plain string (no path import) so this file stays safe for client-side imports
export const SQLITE_DB_PATH = env.SQLITE_DB_PATH;

// Ollama local embedding service (D-01). Override OLLAMA_URL for non-default host/port.
export const OLLAMA_URL = env.OLLAMA_URL;

// Embedding provider gate (D-01). Set to "ollama" to enable nomic-embed-text compute.
// Any other value (including the default "null") disables embedding compute and forces BM25-only.
export const EMBEDDING_PROVIDER = env.MEMROOS_EMBEDDING_PROVIDER;
