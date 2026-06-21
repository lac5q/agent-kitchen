import crypto from "crypto";
import { CLAUDE_MEMORY_PATH, MEM0_URL } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { queryGraphMemory, searchVectorMemory } from "@/lib/memory/backends";
import {
  authorizeMemoryUse,
  extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems,
  type MemoryLabelSnapshot,
  type MemoryUseActor,
} from "@/lib/memory/policy-gate";
import { buildTieredMemoryPayload, resolveMemoryTier } from "@/lib/memory/tiers";
import { parseClaudeMemory } from "@/lib/parsers";
import { protectMemoryPayloadForStorage } from "@/lib/privacy/pii-storage";
import { responseCache } from "@/lib/response-cache";
import { checkMemoryWritePolicy } from "@/lib/security-policy";
import { recordMemoryWrite, registerAgent } from "@/lib/agent-registry";
import { writeAuditLog } from "@/lib/audit";
import type { MemoryEntry, RegisteredAgent } from "@/types";

export const CHATGPT_ACTIONS_AGENT_ID = "chatgpt-mobile";

type SearchTier = "vector" | "graph" | "episodic";

interface SearchOutcome {
  tier: SearchTier;
  items: ChatGptActionResult[];
  error?: string;
}

export interface ChatGptActionResult {
  id: string;
  title: string;
  text: string;
  tier: SearchTier;
  source: string;
  score?: number;
  metadata?: Record<string, unknown>;
  label?: MemoryLabelSnapshot;
}

interface EncodedActionResult {
  title: string;
  text: string;
  tier: SearchTier;
  source: string;
  score?: number;
  label?: MemoryLabelSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hostnameFromHostHeader(value: string): string {
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0] ?? value;
}

function requestHostname(request: Request): string | null {
  try {
    const url = new URL(request.url);
    if (url.hostname && url.hostname !== "0.0.0.0") return url.hostname;
  } catch {
    // Fall back to Host below.
  }
  const host = request.headers.get("host");
  return host ? hostnameFromHostHeader(host) : null;
}

function isLoopbackHost(hostname: string | null): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function actionApiKeyFromRequest(request: Request): string | null {
  const apiKey = request.headers.get("x-api-key");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  return apiKey || bearer;
}

export function authorizeChatGptAction(request: Request): Response | null {
  if (isLoopbackHost(requestHostname(request)) && process.env.MEMROOS_CHATGPT_ACTIONS_REQUIRE_KEY_LOCAL !== "true") {
    return null;
  }

  const expected = process.env.MEMROOS_CHATGPT_ACTIONS_API_KEY;
  if (!expected) {
    return Response.json(
      { ok: false, error: "MEMROOS_CHATGPT_ACTIONS_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const provided = actionApiKeyFromRequest(request);
  if (!provided || !timingSafeEqual(provided, expected)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function parseActionLimit(value: unknown, fallback = 8): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 20) : fallback;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => ({}))) as unknown;
  return isRecord(body) ? body : {};
}

function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  for (const key of ["memory", "content", "text", "summary", "name", "title", "id"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return JSON.stringify(value);
}

function scoreFrom(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const score = value.score ?? value.similarity ?? value.distance;
  return typeof score === "number" ? score : undefined;
}

function resultItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const key of ["results", "memories", "data"]) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function encodeResult(result: EncodedActionResult): string {
  return `memroos:${Buffer.from(JSON.stringify(result), "utf8").toString("base64url")}`;
}

export function decodeChatGptActionResult(id: string): EncodedActionResult {
  if (!id.startsWith("memroos:")) throw new Error("Invalid MemRoOS result id");
  const decoded = JSON.parse(Buffer.from(id.slice("memroos:".length), "base64url").toString("utf8")) as unknown;
  if (!isRecord(decoded)) throw new Error("Invalid MemRoOS result payload");
  const title = typeof decoded.title === "string" ? decoded.title : "";
  const text = typeof decoded.text === "string" ? decoded.text : "";
  const tier = decoded.tier;
  const source = typeof decoded.source === "string" ? decoded.source : "memroos";
  if (!title || !text || (tier !== "vector" && tier !== "graph" && tier !== "episodic")) {
    throw new Error("Invalid MemRoOS result payload");
  }
  const label = extractMemoryLabelSnapshot(decoded.label);
  const decision = authorizeMemoryUse({
    actor: { id: CHATGPT_ACTIONS_AGENT_ID, role: "agent", capability: "chatgpt-action" },
    purpose: "chatgpt-action",
    label: label ?? {},
  });
  if (decision.decision !== "allow") {
    throw new Error("MemRoOS result is not authorized for ChatGPT action fetch");
  }
  return {
    title,
    text,
    tier,
    source,
    score: typeof decoded.score === "number" ? decoded.score : undefined,
    label,
  };
}

function toActionResult(result: Omit<ChatGptActionResult, "id">): ChatGptActionResult {
  const label = result.label ?? extractMemoryLabelSnapshot(result.metadata);
  return {
    ...result,
    label,
    id: encodeResult({
      title: result.title,
      text: result.text,
      tier: result.tier,
      source: result.source,
      score: result.score,
      label,
    }),
  };
}

function normalizeVector(raw: unknown, limit: number): ChatGptActionResult[] {
  return resultItems(raw)
    .slice(0, limit)
    .map((item) =>
      toActionResult({
        title: "Semantic memory",
        text: textFrom(item),
        tier: "vector",
        source: "mem0 / qdrant",
        score: scoreFrom(item),
        metadata: isRecord(item) ? item : undefined,
      })
    )
    .filter((item) => item.text.trim().length > 0);
}

function normalizeGraph(raw: unknown, limit: number): ChatGptActionResult[] {
  const adapterItems = resultItems(raw);
  if (adapterItems.length > 0 && adapterItems.some((item) => isRecord(item) && typeof item.content === "string")) {
    return adapterItems
      .slice(0, limit)
      .map((item) =>
        toActionResult({
          title: "Graph memory",
          text: textFrom(item),
          tier: "graph",
          source: "neo4j",
          metadata: isRecord(item) ? item : undefined,
        })
      )
      .filter((item) => item.text.trim().length > 0);
  }

  const results = isRecord(raw) && Array.isArray(raw.results) ? raw.results : [];
  const rows = results.flatMap((result) => (isRecord(result) && Array.isArray(result.data) ? result.data : []));
  return rows
    .slice(0, limit)
    .map((row) => {
      const values = isRecord(row) && Array.isArray(row.row) ? row.row : [row];
      const node = values[0];
      return toActionResult({
        title: "Graph memory",
        text: textFrom(node),
        tier: "graph",
        source: "neo4j",
        metadata: { node, relationships: values[1], neighbors: values[2] },
      });
    })
    .filter((item) => item.text.trim().length > 0);
}

function normalizeEpisodic(entries: MemoryEntry[], query: string, limit: number): ChatGptActionResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const haystack = `${entry.content} ${entry.type} ${entry.agent} ${entry.source}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit)
    .map((entry) =>
      toActionResult({
        title: `${entry.type} memory`,
        text: entry.content,
        tier: "episodic",
        source: entry.source || entry.agent,
        score: entry.score,
        metadata: {
          id: entry.id,
          agent: entry.agent,
          date: entry.date,
          type: entry.type,
          source: entry.source,
        },
      })
    );
}

export async function searchMemroosForChatGpt(query: string, limit: number): Promise<{
  results: ChatGptActionResult[];
  tiers: Array<{ tier: SearchTier; ok: boolean; count: number; error?: string }>;
}> {
  const [vector, graph, episodic]: SearchOutcome[] = await Promise.all([
    searchVectorMemory(query, limit)
      .then((raw) => ({ tier: "vector" as const, items: normalizeVector(raw, limit) }))
      .catch((error) => ({
        tier: "vector" as const,
        items: [] as ChatGptActionResult[],
        error: error instanceof Error ? error.message : "Vector memory backend unavailable",
      })),
    queryGraphMemory(query, limit)
      .then((raw) => ({ tier: "graph" as const, items: normalizeGraph(raw, limit) }))
      .catch((error) => ({
        tier: "graph" as const,
        items: [] as ChatGptActionResult[],
        error: error instanceof Error ? error.message : "Graph memory backend unavailable",
      })),
    parseClaudeMemory(CLAUDE_MEMORY_PATH)
      .then((entries) => ({ tier: "episodic" as const, items: normalizeEpisodic(entries, query, limit) }))
      .catch((error) => ({
        tier: "episodic" as const,
        items: [] as ChatGptActionResult[],
        error: error instanceof Error ? error.message : "Episodic memory unavailable",
      })),
  ]);

  const outcomes = [vector, graph, episodic];
  const db = getDb();
  const actor: MemoryUseActor = { id: CHATGPT_ACTIONS_AGENT_ID, role: "agent", capability: "chatgpt-action" };
  const authorizedOutcomes = outcomes.map((outcome) => ({
    ...outcome,
    items: filterAuthorizedMemoryItems(
      db,
      outcome.items,
      actor,
      "chatgpt-action",
      (item) => item.label ?? extractMemoryLabelSnapshot(item.metadata),
      (item) => `chatgpt-action:${item.tier}:${item.source}:${item.title}`
    ),
  }));
  return {
    results: authorizedOutcomes.flatMap((outcome) => outcome.items).slice(0, limit * 3),
    tiers: authorizedOutcomes.map((outcome) => ({
      tier: outcome.tier,
      ok: !outcome.error,
      count: outcome.items.length,
      error: outcome.error,
    })),
  };
}

function ensureChatGptAgent(): RegisteredAgent {
  return registerAgent({
    id: CHATGPT_ACTIONS_AGENT_ID,
    name: "ChatGPT Mobile",
    role: "Mobile GPT Actions bridge for Luis",
    platform: "chatgpt",
    protocol: "rest",
    capabilities: [
      { id: "memory:write:episodic", name: "Write Episodic Memory", description: "Save mobile notes", tags: ["memory"] },
      { id: "memory:write:vector", name: "Write Vector Memory", description: "Save semantic memories", tags: ["memory"] },
    ],
    metadata: { source: "chatgpt-actions" },
  }).agent;
}

export async function saveMemroosFromChatGpt(input: {
  text: string;
  type?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ tier: string; result: Record<string, unknown> }> {
  const agent = ensureChatGptAgent();
  const payload = buildTieredMemoryPayload({
    text: input.text,
    content: input.text,
    type: input.type ?? "episodic",
    agent_id: agent.id,
    metadata: {
      source: input.source ?? "chatgpt-mobile",
      ...(input.metadata ?? {}),
    },
  });
  const storagePayload = protectMemoryPayloadForStorage(payload);
  const tier = resolveMemoryTier(storagePayload);
  const policy = checkMemoryWritePolicy(agent, tier);
  if (!policy.allowed) {
    writeAuditLog(getDb(), {
      actor: agent.id,
      action: "policy_denied",
      target: "chatgpt_action_memory_write",
      detail: JSON.stringify({ code: policy.code, ...(policy.detail ?? {}) }),
      severity: "high",
    });
    throw new Error(policy.message ?? "Action denied by security policy");
  }

  const response = await fetch(`${MEM0_URL}/memory/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(storagePayload),
    signal: AbortSignal.timeout(30_000),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error("Memory backend unavailable");

  recordMemoryWrite(
    agent.id,
    {
      type: tier,
      content: typeof storagePayload.content === "string" ? storagePayload.content : undefined,
      metadata: isRecord(storagePayload.metadata) ? storagePayload.metadata : {},
    },
    result
  );
  responseCache.invalidateTag("memory");
  return { tier, result };
}
