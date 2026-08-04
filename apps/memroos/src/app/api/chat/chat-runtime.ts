import { readFile } from "fs/promises";
import path from "path";
import { getRegisteredAgent } from "@/lib/agent/registry";
import type { AgentPlatform } from "@/types";

export type AgentContext = {
  systemPrompt: string;
  source: "knowledge" | "pmo" | "fallback";
  dir: string | null;
  agentInstructions: string | null;
};

export type ChatRuntime =
  | { runner: "anthropic"; model: string }
  | { runner: "opencode"; model: string };
export type ChatRuntimeSource =
  | "operator-override"
  | "agent-instructions"
  | "pmo-routing"
  | "registered-platform"
  | "instruction-hint"
  | "default";
export type ChatRuntimeCandidate = ChatRuntime & {
  source: ChatRuntimeSource;
  detail: string;
};
export type ChatRuntimePlan = {
  primary: ChatRuntimeCandidate;
  candidates: ChatRuntimeCandidate[];
};
export type ChatRuntimeStatus = {
  status: "ready" | "blocked" | "warning";
  detail: string;
  lastError?: string;
};

const AGENT_CONFIGS_PATH =
  process.env.AGENT_CONFIGS_PATH ||
  `${process.env.HOME}/github/knowledge/agent-configs`;
const PMO_AGENT_CONFIGS_PATH =
  process.env.PMO_AGENT_CONFIGS_PATH ||
  `${process.env.HOME}/github/PMO/agents`;
const PMO_MODEL_ROUTING_PATH =
  process.env.PMO_MODEL_ROUTING_PATH ||
  `${process.env.HOME}/github/PMO/config/model-routing.yaml`;
const DEFAULT_ANTHROPIC_CHAT_MODEL =
  process.env.MEMROOS_ANTHROPIC_CHAT_MODEL ||
  process.env.CHAT_MODEL ||
  "claude-haiku-4-5-20251001";
const DEFAULT_PAPERCLIP_CHAT_MODEL =
  process.env.PAPERCLIP_CHAT_MODEL || "bailian/qwen3.5-plus";
const DEFAULT_GEMINI_CHAT_MODEL =
  process.env.MEMROOS_GEMINI_CHAT_MODEL || "gemini-pro";
const ANTHROPIC_CHAT_PLATFORMS = new Set<AgentPlatform>([
  "claude",
  "cline",
  "codex",
  "hermes",
  "openclaw",
  "chatgpt",
]);

const MODEL_ALIASES: Record<string, string> = {
  "qwen3.5": "bailian/qwen3.5-plus",
  "qwen3.5-plus": "bailian/qwen3.5-plus",
  "qwen-plus-latest": "bailian/qwen3.5-plus",
  "qwen3.6": "alibaba-coding-plan/qwen3.6-plus",
  "qwen3.6-plus": "alibaba-coding-plan/qwen3.6-plus",
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-opus": "claude-opus-4-6",
  "gemini-pro": "google/gemini-2.0-pro-exp",
};
const RUNTIME_FAILURE_COOLDOWN_MS = Number.parseInt(
  process.env.MEMROOS_CHAT_FAILURE_COOLDOWN_MS ?? `${10 * 60 * 1000}`,
  10
);
const runtimeFailures = new Map<string, { error: string; failedAt: number; providerLimited: boolean }>();

export function isProviderLimitError(message: string): boolean {
  return /rate_limit_error|usage limit exceeded|credit balance is too low|quota|429/i.test(message);
}

async function tryRead(filePath: string, maxLines = 150): Promise<string | null> {
  try {
    const content = await readFile(/* turbopackIgnore: true */ filePath, "utf-8");
    const lines = content.split("\n");
    return lines.length > maxLines
      ? lines.slice(0, maxLines).join("\n") + "\n\n[...truncated]"
      : content;
  } catch {
    return null;
  }
}

function agentIdCandidates(agentId: string): string[] {
  return [...new Set([
    agentId,
    agentId.replaceAll("-", "_"),
    agentId.replaceAll("_", "-"),
  ])];
}

async function resolveAgentDir(agentId: string): Promise<{ dir: string; source: "knowledge" | "pmo" } | null> {
  const candidates = agentIdCandidates(agentId);
  const roots: Array<{ root: string; source: "knowledge" | "pmo" }> = [
    { root: AGENT_CONFIGS_PATH, source: "knowledge" },
    { root: PMO_AGENT_CONFIGS_PATH, source: "pmo" },
  ];

  for (const { root, source } of roots) {
    for (const id of candidates) {
      const candidate = path.join(/* turbopackIgnore: true */ root, id);
      if (
        (await tryRead(path.join(/* turbopackIgnore: true */ candidate, "SOUL.md"), 1)) ||
        (await tryRead(path.join(/* turbopackIgnore: true */ candidate, "AGENTS.md"), 1))
      ) {
        return { dir: candidate, source };
      }
    }
  }

  return null;
}

export async function buildAgentContext(agentId: string): Promise<AgentContext> {
  const resolved = await resolveAgentDir(agentId);
  const dir = resolved?.dir;

  if (!dir) {
    return {
      systemPrompt: "You are a helpful AI assistant embedded in MemroOS. Keep responses concise.",
      source: "fallback",
      dir: null,
      agentInstructions: null,
    };
  }

  const [soul, agentInstructions, memory, lessons, heartbeatState, heartbeat] = await Promise.all([
    tryRead(path.join(/* turbopackIgnore: true */ dir, "SOUL.md")),
    tryRead(path.join(/* turbopackIgnore: true */ dir, "AGENTS.md")),
    tryRead(path.join(/* turbopackIgnore: true */ dir, "MEMORY.md"), 80),
    tryRead(path.join(/* turbopackIgnore: true */ dir, "LESSONS.md"), 80),
    tryRead(path.join(/* turbopackIgnore: true */ dir, "HEARTBEAT_STATE.md"), 50),
    tryRead(path.join(/* turbopackIgnore: true */ dir, "HEARTBEAT.md"), 100),
  ]);

  const sections: string[] = [];
  if (soul) {
    sections.push(soul.replace(/^---[\s\S]*?---\n?/, "").trim());
  }
  if (agentInstructions) {
    sections.push(`\n\n## Agent Instructions\n${agentInstructions}`);
  }
  if (heartbeatState) {
    sections.push(`\n\n## Current Status\n${heartbeatState}`);
  }
  if (heartbeat && !heartbeatState) {
    sections.push(`\n\n## Recent Activity\n${heartbeat}`);
  }
  if (memory) {
    sections.push(`\n\n## Memory\n${memory}`);
  }
  if (lessons) {
    sections.push(`\n\n## Lessons Learned\n${lessons}`);
  }

  sections.push(
    `\n\n## Instructions\nYou are being spoken to directly by Luis Calderon, who built and runs you. ` +
    `Answer as yourself - your actual role, your current work, your real situation. ` +
    `Be direct and honest. Keep responses concise.`
  );

  return {
    systemPrompt: sections.join(""),
    source: resolved.source,
    dir,
    agentInstructions,
  };
}

export function normalizeModel(model: string): string {
  const trimmed = model.trim().replace(/^["'`]|["'`]$/g, "");
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

function isOpenCodeModel(model: string): boolean {
  return (
    model.includes("/") ||
    model.startsWith("qwen") ||
    model.startsWith("kimi") ||
    model.startsWith("gemini")
  );
}

function modelToRuntime(model: string): ChatRuntime {
  const normalized = normalizeModel(model);
  if (isOpenCodeModel(normalized)) {
    return { runner: "opencode", model: normalized };
  }
  return { runner: "anthropic", model: normalized };
}

function runtimeKey(runtime: ChatRuntime): string {
  return `${runtime.runner}:${runtime.model}`;
}

function toCandidate(model: string, source: ChatRuntimeSource, detail: string): ChatRuntimeCandidate {
  return { ...modelToRuntime(model), source, detail };
}

function pushUniqueCandidate(candidates: ChatRuntimeCandidate[], candidate: ChatRuntimeCandidate) {
  if (candidates.some((existing) => existing.runner === candidate.runner && existing.model === candidate.model)) return;
  candidates.push(candidate);
}

function stripCandidate(candidate: ChatRuntimeCandidate): ChatRuntime {
  return { runner: candidate.runner, model: candidate.model } as ChatRuntime;
}

export function recordChatRuntimeFailure(runtime: ChatRuntime, error: string) {
  runtimeFailures.set(runtimeKey(runtime), {
    error,
    failedAt: Date.now(),
    providerLimited: isProviderLimitError(error),
  });
}

export function recordChatRuntimeSuccess(runtime: ChatRuntime) {
  runtimeFailures.delete(runtimeKey(runtime));
}

export function chatRuntimeStatus(runtime: ChatRuntime): ChatRuntimeStatus {
  const failure = runtimeFailures.get(runtimeKey(runtime));
  if (failure && Date.now() - failure.failedAt <= RUNTIME_FAILURE_COOLDOWN_MS) {
    return {
      status: failure.providerLimited ? "blocked" : "warning",
      detail: failure.providerLimited
        ? `Last provider attempt was quota-blocked: ${failure.error}`
        : `Last provider attempt failed: ${failure.error}`,
      lastError: failure.error,
    };
  }

  if (runtime.runner === "opencode") {
    const enabled = process.env.MEMROOS_ENABLE_OPENCODE === "true";
    return {
      status: enabled ? "ready" : "blocked",
      detail: enabled
        ? `OpenCode runner is enabled for ${runtime.model}.`
        : `OpenCode runner is disabled for ${runtime.model}. Set MEMROOS_ENABLE_OPENCODE=true for live chat.`,
    };
  }

  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    status: configured ? "ready" : "blocked",
    detail: configured
      ? `Anthropic chat is configured for ${runtime.model}. Provider quota can still reject a live response.`
      : "ANTHROPIC_API_KEY is missing.",
  };
}

function anthropicModelForRegisteredAgent(agent: { id: string; name: string; role: string }): string {
  const haystack = `${agent.id} ${agent.name} ${agent.role}`.toLowerCase();
  if (haystack.includes("opus")) return normalizeModel("claude-opus");
  if (haystack.includes("sonnet")) return normalizeModel("claude-sonnet");
  return DEFAULT_ANTHROPIC_CHAT_MODEL;
}

function registeredPlatformRuntime(agent: {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
}): ChatRuntime | null {
  if (agent.platform === "gemini") {
    return modelToRuntime(DEFAULT_GEMINI_CHAT_MODEL);
  }

  if (agent.platform === "qwen" || agent.platform === "opencode") {
    return modelToRuntime(DEFAULT_PAPERCLIP_CHAT_MODEL);
  }

  if (ANTHROPIC_CHAT_PLATFORMS.has(agent.platform)) {
    return modelToRuntime(anthropicModelForRegisteredAgent(agent));
  }

  return null;
}

async function pmoDefaultModelForAgent(agentId: string): Promise<string | null> {
  const routing = await tryRead(PMO_MODEL_ROUTING_PATH, 240);
  if (!routing) return null;

  const ids = agentIdCandidates(agentId);
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = routing.match(new RegExp(`\\n\\s*${escaped}:\\s*\\n([\\s\\S]*?)(?=\\n\\s{2}[a-zA-Z0-9_-]+:|\\n#|$)`));
    const match = block?.[1]?.match(/default_model:\s*([^\s#]+)/);
    if (match?.[1]) return normalizeModel(match[1]);
  }

  const defaultRule = routing.match(/-\s+name:\s+default[\s\S]*?preferred_model:\s*([^\s#]+)/);
  return defaultRule?.[1] ? normalizeModel(defaultRule[1]) : null;
}

export async function resolveChatRuntimePlan(agentId: string, context: AgentContext): Promise<ChatRuntimePlan> {
  const candidates: ChatRuntimeCandidate[] = [];
  const operatorOverride = process.env.MEMROOS_CHAT_MODEL;
  if (operatorOverride) {
    pushUniqueCandidate(candidates, toCandidate(
      operatorOverride,
      "operator-override",
      "MEMROOS_CHAT_MODEL operator override."
    ));
  }

  const registeredAgent = getRegisteredAgent(agentId);
  const registeredRuntime = registeredAgent
    ? registeredPlatformRuntime(registeredAgent)
    : null;
  const instructions = context.agentInstructions ?? "";
  const explicitModel = instructions.match(/(?:default_model|default model|model)\s*[:=]\s*`?([a-zA-Z0-9_.:/+-]+)/i)?.[1];
  if (explicitModel) {
    pushUniqueCandidate(candidates, toCandidate(
      explicitModel,
      "agent-instructions",
      "Agent instructions specify an explicit chat model."
    ));
  }

  if (context.source === "pmo") {
    pushUniqueCandidate(candidates, toCandidate(
      (await pmoDefaultModelForAgent(agentId)) ?? DEFAULT_PAPERCLIP_CHAT_MODEL,
      "pmo-routing",
      "PMO model routing default for this agent."
    ));
  }

  if (!registeredRuntime && /qwen|bailian/i.test(instructions)) {
    pushUniqueCandidate(candidates, toCandidate(
      DEFAULT_PAPERCLIP_CHAT_MODEL,
      "instruction-hint",
      "Agent instructions mention Qwen/Bailian."
    ));
  }

  if (registeredRuntime) {
    pushUniqueCandidate(candidates, {
      ...registeredRuntime,
      source: "registered-platform",
      detail: `Registered ${registeredAgent?.platform ?? "agent"} platform default.`,
    });
  }

  pushUniqueCandidate(candidates, toCandidate(
    DEFAULT_ANTHROPIC_CHAT_MODEL,
    "default",
    "MemRoOS default Anthropic chat model."
  ));

  return {
    primary: candidates[0],
    candidates,
  };
}

export async function resolveChatRuntime(agentId: string, context: AgentContext): Promise<ChatRuntime> {
  const plan = await resolveChatRuntimePlan(agentId, context);
  return stripCandidate(plan.primary);
}
