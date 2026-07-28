import { z } from "zod";
import { existsSync } from "fs";
import path from "path";

const nonEmptyString = z.string().trim().min(1);
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "must be an http(s) URL",
  });
const positiveInteger = z.coerce.number().int().positive();
const optionalBoolean = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["1", "true", "yes", "on", "0", "false", "no", "off"]))
  .transform((value) => ["1", "true", "yes", "on"].includes(value))
  .optional();
const a2aProfile = z.enum(["local-dev", "single-host", "private-network", "cloud-https", "custom"]);
const embeddingProvider = z.enum(["null", "ollama"]);

const rawEnvSchema = z
  .object({
    HOME: nonEmptyString.optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    NEXT_RUNTIME: nonEmptyString.optional(),
    MEM0_URL: httpUrl.optional(),
    MEM0_PORT: positiveInteger.optional(),
    MEMROOS_PORT: positiveInteger.optional(),
    MEMROOS_PUBLIC_BASE_URL: httpUrl.optional(),
    SQLITE_DB_PATH: nonEmptyString.optional(),
    AGENT_CONFIGS_PATH: nonEmptyString.optional(),
    PMO_AGENT_CONFIGS_PATH: nonEmptyString.optional(),
    PMO_MODEL_ROUTING_PATH: nonEmptyString.optional(),
    PMO_MEMORY_PATH: nonEmptyString.optional(),
    CLAUDE_MEMORY_PATH: nonEmptyString.optional(),
    QWEN_MEMORY_PATH: nonEmptyString.optional(),
    HERMES_MEMORY_PATH: nonEmptyString.optional(),
    CODEX_MEMORY_PATH: nonEmptyString.optional(),
    SKILLS_PATH: nonEmptyString.optional(),
    SKILL_CONTRIBUTIONS_LOG: nonEmptyString.optional(),
    FAILURES_LOG: nonEmptyString.optional(),
    KNOWLEDGE_BASE_PATH: nonEmptyString.optional(),
    KNOWLEDGE_HOME: nonEmptyString.optional(),
    COLLECTIONS_CONFIG_PATH: nonEmptyString.optional(),
    CONTEXT_SOURCES_CONFIG: nonEmptyString.optional(),
    CONTEXT_SOURCES_LOCAL_CONFIG: nonEmptyString.optional(),
    MEMROOS_A2A_PROFILE: a2aProfile.optional(),
    MEMROOS_A2A_ENDPOINT_BASE_URL: httpUrl.optional(),
    MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS: positiveInteger.optional(),
    MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS: optionalBoolean,
    MEMROOS_A2A_ADK_FIXTURE_CARD_URL: httpUrl.optional(),
    MEMROOS_INTERNAL_API_KEY: nonEmptyString.optional(),
    MEMROOS_JWT_SECRET: nonEmptyString.optional(),
    MEMROOS_EMBEDDING_PROVIDER: embeddingProvider.optional(),
    OLLAMA_URL: httpUrl.optional(),
    // Deployed hosts, docker-compose, and scripts/memroos-env-gaps.sh all set
    // OLLAMA_BASE_URL. Only OLLAMA_URL was ever read, so a host could have a
    // perfectly correct OLLAMA_BASE_URL=http://ollama:11434 while the app
    // silently fell back to localhost:11434 — which inside a container is the
    // container itself. embedText() degrades without throwing, so this
    // surfaced only as embeddings staying at 0 forever.
    OLLAMA_BASE_URL: httpUrl.optional(),
    QDRANT_URL: httpUrl.optional(),
    QDRANT_API_KEY: nonEmptyString.optional(),
    NEO4J_HTTP_URL: httpUrl.optional(),
    NEO4J_DATABASE: nonEmptyString.optional(),
    NEO4J_USERNAME: nonEmptyString.optional(),
    NEO4J_PASSWORD: nonEmptyString.optional(),
    ANTHROPIC_API_KEY: nonEmptyString.optional(),
  })
  .passthrough();

export type A2aOperatingProfile = z.infer<typeof a2aProfile>;
export type EmbeddingProvider = z.infer<typeof embeddingProvider>;

export interface RootConfigStatus {
  file: "agents.config.json" | "collections.config.json" | "context-sources.config.json";
  path: string;
  status: "present" | "missing";
  role: "legacy" | "active";
  canonicalSource: string;
}

export interface MemroosEnv {
  HOME: string;
  NODE_ENV: "development" | "production" | "test";
  NEXT_RUNTIME?: string;
  MEM0_URL: string;
  MEM0_PORT: number;
  MEMROOS_PORT: number;
  MEMROOS_PUBLIC_BASE_URL: string;
  SQLITE_DB_PATH: string;
  AGENT_CONFIGS_PATH: string;
  PMO_AGENT_CONFIGS_PATH: string;
  PMO_MODEL_ROUTING_PATH: string;
  PMO_MEMORY_PATH: string;
  CLAUDE_MEMORY_PATH: string;
  QWEN_MEMORY_PATH: string;
  HERMES_MEMORY_PATH: string;
  CODEX_MEMORY_PATH: string;
  SKILLS_PATH: string;
  SKILL_CONTRIBUTIONS_LOG: string;
  FAILURES_LOG: string;
  KNOWLEDGE_BASE_PATH: string;
  COLLECTIONS_CONFIG_PATH: string;
  CONTEXT_SOURCES_CONFIG: string;
  CONTEXT_SOURCES_LOCAL_CONFIG: string;
  MEMROOS_A2A_PROFILE: A2aOperatingProfile;
  MEMROOS_A2A_ENDPOINT_BASE_URL: string;
  MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS: number;
  MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS?: boolean;
  MEMROOS_A2A_ADK_FIXTURE_CARD_URL: string;
  MEMROOS_INTERNAL_API_KEY?: string;
  MEMROOS_JWT_SECRET?: string;
  MEMROOS_EMBEDDING_PROVIDER: EmbeddingProvider;
  OLLAMA_URL: string;
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  NEO4J_HTTP_URL?: string;
  NEO4J_DATABASE?: string;
  NEO4J_USERNAME?: string;
  NEO4J_PASSWORD?: string;
  ANTHROPIC_API_KEY?: string;
}

export function loadMemroosEnv(source: NodeJS.ProcessEnv = process.env): MemroosEnv {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`[Memroos] Invalid environment configuration: ${details}`);
  }

  const home = parsed.data.HOME ?? process.env.HOME ?? "";
  const publicBaseUrl = parsed.data.MEMROOS_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const knowledgeBasePath = parsed.data.KNOWLEDGE_BASE_PATH ?? parsed.data.KNOWLEDGE_HOME ?? `${home}/github/knowledge`;

  return {
    HOME: home,
    NODE_ENV: parsed.data.NODE_ENV ?? "development",
    NEXT_RUNTIME: parsed.data.NEXT_RUNTIME,
    MEM0_URL: parsed.data.MEM0_URL ?? "http://localhost:3201",
    MEM0_PORT: parsed.data.MEM0_PORT ?? 3201,
    MEMROOS_PORT: parsed.data.MEMROOS_PORT ?? 3000,
    MEMROOS_PUBLIC_BASE_URL: publicBaseUrl,
    SQLITE_DB_PATH: parsed.data.SQLITE_DB_PATH ?? "data/conversations.db",
    AGENT_CONFIGS_PATH: parsed.data.AGENT_CONFIGS_PATH ?? `${home}/github/knowledge/agent-configs`,
    PMO_AGENT_CONFIGS_PATH: parsed.data.PMO_AGENT_CONFIGS_PATH ?? `${home}/github/PMO/agents`,
    PMO_MODEL_ROUTING_PATH: parsed.data.PMO_MODEL_ROUTING_PATH ?? `${home}/github/PMO/config/model-routing.yaml`,
    PMO_MEMORY_PATH: parsed.data.PMO_MEMORY_PATH ?? `${home}/github/PMO/memory`,
    CLAUDE_MEMORY_PATH: parsed.data.CLAUDE_MEMORY_PATH ?? `${home}/.claude/projects`,
    QWEN_MEMORY_PATH: parsed.data.QWEN_MEMORY_PATH ?? `${home}/.qwen/projects`,
    HERMES_MEMORY_PATH: parsed.data.HERMES_MEMORY_PATH ?? `${home}/.hermes/sessions`,
    CODEX_MEMORY_PATH: parsed.data.CODEX_MEMORY_PATH ?? `${home}/.codex/sessions`,
    SKILLS_PATH: parsed.data.SKILLS_PATH ?? `${home}/.claude/skills`,
    SKILL_CONTRIBUTIONS_LOG: parsed.data.SKILL_CONTRIBUTIONS_LOG ?? `${home}/.openclaw/skill-contributions.jsonl`,
    FAILURES_LOG: parsed.data.FAILURES_LOG ?? `${home}/.openclaw/failures.log`,
    KNOWLEDGE_BASE_PATH: knowledgeBasePath,
    COLLECTIONS_CONFIG_PATH: parsed.data.COLLECTIONS_CONFIG_PATH ?? "collections.config.json",
    CONTEXT_SOURCES_CONFIG: parsed.data.CONTEXT_SOURCES_CONFIG ?? "context-sources.config.json",
    CONTEXT_SOURCES_LOCAL_CONFIG:
      parsed.data.CONTEXT_SOURCES_LOCAL_CONFIG ?? `${home}/.memroos/context-sources.local.json`,
    MEMROOS_A2A_PROFILE: parsed.data.MEMROOS_A2A_PROFILE ?? "local-dev",
    MEMROOS_A2A_ENDPOINT_BASE_URL: parsed.data.MEMROOS_A2A_ENDPOINT_BASE_URL ?? publicBaseUrl,
    MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS: parsed.data.MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS ?? 5000,
    MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS: parsed.data.MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS,
    MEMROOS_A2A_ADK_FIXTURE_CARD_URL:
      parsed.data.MEMROOS_A2A_ADK_FIXTURE_CARD_URL ??
      "http://localhost:8001/a2a/check_prime_agent/.well-known/agent-card.json",
    MEMROOS_INTERNAL_API_KEY: parsed.data.MEMROOS_INTERNAL_API_KEY,
    MEMROOS_JWT_SECRET: parsed.data.MEMROOS_JWT_SECRET,
    MEMROOS_EMBEDDING_PROVIDER: parsed.data.MEMROOS_EMBEDDING_PROVIDER ?? "null",
    OLLAMA_URL:
      parsed.data.OLLAMA_URL ??
      parsed.data.OLLAMA_BASE_URL ??
      "http://localhost:11434",
    QDRANT_URL: parsed.data.QDRANT_URL,
    QDRANT_API_KEY: parsed.data.QDRANT_API_KEY,
    NEO4J_HTTP_URL: parsed.data.NEO4J_HTTP_URL,
    NEO4J_DATABASE: parsed.data.NEO4J_DATABASE,
    NEO4J_USERNAME: parsed.data.NEO4J_USERNAME,
    NEO4J_PASSWORD: parsed.data.NEO4J_PASSWORD,
    ANTHROPIC_API_KEY: parsed.data.ANTHROPIC_API_KEY,
  };
}

export function getMemroosEnvValue(name: string, source: NodeJS.ProcessEnv = process.env): string | undefined {
  return source[name];
}

export function reconcileRootConfigStatus(root = process.cwd()): RootConfigStatus[] {
  const configs: Array<Omit<RootConfigStatus, "path" | "status">> = [
    {
      file: "agents.config.json",
      role: "legacy",
      canonicalSource: "SQLite agent registry plus A2A card ingestion",
    },
    {
      file: "collections.config.json",
      role: "active",
      canonicalSource: "typed COLLECTIONS_CONFIG_PATH",
    },
    {
      file: "context-sources.config.json",
      role: "active",
      canonicalSource: "typed CONTEXT_SOURCES_CONFIG",
    },
  ];

  return configs.map((config) => {
    const configPath = path.join(root, config.file);
    return {
      ...config,
      path: configPath,
      status: existsSync(configPath) ? "present" : "missing",
    };
  });
}

export function validateMemroosEnvAtStartup(source: NodeJS.ProcessEnv = process.env): {
  env: MemroosEnv;
  rootConfigStatus: RootConfigStatus[];
} {
  return {
    env: loadMemroosEnv(source),
    rootConfigStatus: reconcileRootConfigStatus(),
  };
}
