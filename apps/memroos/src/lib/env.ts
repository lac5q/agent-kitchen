import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

const rawEnvSchema = z
  .object({
    HOME: nonEmptyString.optional(),
    MEM0_URL: z
      .string()
      .trim()
      .url()
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "must be an http(s) URL",
      })
      .optional(),
    SQLITE_DB_PATH: nonEmptyString.optional(),
    AGENT_CONFIGS_PATH: nonEmptyString.optional(),
    PMO_MEMORY_PATH: nonEmptyString.optional(),
    CLAUDE_MEMORY_PATH: nonEmptyString.optional(),
    QWEN_MEMORY_PATH: nonEmptyString.optional(),
    HERMES_MEMORY_PATH: nonEmptyString.optional(),
  })
  .passthrough();

export interface MemroosEnv {
  HOME: string;
  MEM0_URL: string;
  SQLITE_DB_PATH: string;
  AGENT_CONFIGS_PATH: string;
  PMO_MEMORY_PATH: string;
  CLAUDE_MEMORY_PATH: string;
  QWEN_MEMORY_PATH: string;
  HERMES_MEMORY_PATH: string;
}

export function loadMemroosEnv(source: NodeJS.ProcessEnv = process.env): MemroosEnv {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`[Memroos] Invalid environment configuration: ${details}`);
  }

  const home = parsed.data.HOME ?? process.env.HOME ?? "";

  return {
    HOME: home,
    MEM0_URL: parsed.data.MEM0_URL ?? "http://localhost:3201",
    SQLITE_DB_PATH: parsed.data.SQLITE_DB_PATH ?? "data/conversations.db",
    AGENT_CONFIGS_PATH: parsed.data.AGENT_CONFIGS_PATH ?? `${home}/github/knowledge/agent-configs`,
    PMO_MEMORY_PATH: parsed.data.PMO_MEMORY_PATH ?? `${home}/github/PMO/memory`,
    CLAUDE_MEMORY_PATH: parsed.data.CLAUDE_MEMORY_PATH ?? `${home}/.claude/projects`,
    QWEN_MEMORY_PATH: parsed.data.QWEN_MEMORY_PATH ?? `${home}/.qwen/projects`,
    HERMES_MEMORY_PATH: parsed.data.HERMES_MEMORY_PATH ?? `${home}/.hermes/sessions`,
  };
}
