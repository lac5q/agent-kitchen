import crypto from "crypto";
import { getDb } from "@/lib/db";
import type { AgentPlatform, AgentProtocol, RegisteredAgentCapability } from "@/types";

export interface AgentOnboardingTokenPayload {
  version: 1;
  exp: number;
  memroosUrl: string;
  mcpUrl: string;
  allowedAgentIds?: string[];
  defaultPlatform?: AgentPlatform;
  defaultProtocol?: AgentProtocol;
  capabilities?: RegisteredAgentCapability[];
  nonce: string;
  /** Human user id that will own agents registered with this token. */
  ownerUserId?: string;
}

export interface CreateAgentOnboardingTokenInput {
  memroosUrl: string;
  mcpUrl?: string;
  ttlSeconds?: number;
  allowedAgentIds?: string[];
  defaultPlatform?: AgentPlatform;
  defaultProtocol?: AgentProtocol;
  capabilities?: RegisteredAgentCapability[];
  ownerUserId?: string;
}

export interface VerifiedOnboardingToken {
  ok: true;
  payload: AgentOnboardingTokenPayload;
}

export interface RejectedOnboardingToken {
  ok: false;
  error: string;
}

export class OnboardingTokenReplayError extends Error {
  readonly code = "onboarding_token_replayed";

  constructor() {
    super("Onboarding token has already been used");
    this.name = "OnboardingTokenReplayError";
  }
}

const DEFAULT_TTL_SECONDS = 15 * 60;

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function signingSecret(): string {
  const secret = process.env.MEMROOS_ONBOARDING_SECRET || process.env.MEMROOS_OPERATOR_API_KEY;
  if (secret) return secret;
  return "local-dev-memroos-onboarding";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function createAgentOnboardingToken(input: CreateAgentOnboardingTokenInput): {
  token: string;
  payload: AgentOnboardingTokenPayload;
} {
  const memroosUrl = normalizeUrl(input.memroosUrl);
  const payload: AgentOnboardingTokenPayload = {
    version: 1,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    memroosUrl,
    mcpUrl: input.mcpUrl ? normalizeUrl(input.mcpUrl) : `${memroosUrl}/mcp`,
    allowedAgentIds: input.allowedAgentIds?.filter(Boolean),
    defaultPlatform: input.defaultPlatform,
    defaultProtocol: input.defaultProtocol,
    capabilities: input.capabilities,
    nonce: crypto.randomBytes(16).toString("base64url"),
    ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
  };

  const body = base64UrlJson(payload);
  return { token: `${body}.${sign(body)}`, payload };
}

export function verifyAgentOnboardingToken(token: string): VerifiedOnboardingToken | RejectedOnboardingToken {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) {
    return { ok: false, error: "Invalid onboarding token" };
  }
  if (!safeEqual(sign(body), signature)) {
    return { ok: false, error: "Invalid onboarding token signature" };
  }

  const payload = decodeBase64UrlJson<AgentOnboardingTokenPayload>(body);
  if (!payload || payload.version !== 1 || typeof payload.exp !== "number") {
    return { ok: false, error: "Invalid onboarding token payload" };
  }
  if (
    !Array.isArray(payload.allowedAgentIds) ||
    payload.allowedAgentIds.length === 0 ||
    payload.allowedAgentIds.some((agentId) => typeof agentId !== "string" || !agentId.trim())
  ) {
    return { ok: false, error: "Invalid onboarding token scope" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "Onboarding token expired" };
  }
  return { ok: true, payload };
}

/**
 * Record the nonce inside the caller's registration transaction. The primary
 * key is the single-use guard: a duplicate INSERT is a replay, while a
 * rollback from any later registration failure leaves the nonce reusable.
 */
export function consumeAgentOnboardingToken(payload: AgentOnboardingTokenPayload, agentId: string): void {
  const db = getDb();
  const now = new Date();
  const consumedAt = now.toISOString();
  const expiresAt = new Date(payload.exp * 1000).toISOString();

  db.prepare("DELETE FROM onboarding_token_nonces WHERE expires_at <= ?").run(consumedAt);
  try {
    db.prepare(
      `INSERT INTO onboarding_token_nonces (nonce, agent_id, consumed_at, expires_at)
       VALUES (?, ?, ?, ?)`
    ).run(payload.nonce, agentId, consumedAt, expiresAt);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: onboarding_token_nonces\.nonce/.test(error.message)) {
      throw new OnboardingTokenReplayError();
    }
    throw error;
  }
}

export function buildMemroosMcpConfig(mcpUrl: string): Record<string, unknown> {
  const entry = {
    url: normalizeUrl(mcpUrl),
  };

  return {
    mcpServers: {
      memroos: entry,
    },
  };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
