import crypto from "crypto";
import { getDb } from "@/lib/db";
import type { AgentPlatform, AgentProtocol, RegisteredAgentCapability } from "@/types";

export interface AgentOnboardingTokenPayload {
  version: 1;
  /** Optional for tokens minted before signing-key diagnostics were added. */
  kid?: string;
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

export class OnboardingMintError extends Error {
  readonly code = "onboarding_mint_invalid_url";
  readonly label: string;

  constructor(label: string, reason: string) {
    super(`${label} is not a mintable URL: ${reason}`);
    this.name = "OnboardingMintError";
    this.label = label;
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

function signingKeyId(): string {
  return crypto.createHash("sha256").update(signingSecret()).digest("hex").slice(0, 8);
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

function hasRepeatedStringUnit(value: string): boolean {
  for (let unitLength = 1; unitLength * 2 <= value.length; unitLength += 1) {
    if (value.length % unitLength !== 0) continue;
    const unit = value.slice(0, unitLength);
    if (unit.includes(".") && unit.repeat(value.length / unitLength) === value) return true;
  }
  return false;
}

function hasRepeatedHostnameSegment(hostname: string): boolean {
  const labels = hostname.split(".").filter(Boolean);
  for (let size = 1; size * 2 <= labels.length; size += 1) {
    const previous = labels.slice(-size * 2, -size).join(".");
    const suffix = labels.slice(-size).join(".");
    if (previous && previous === suffix) return true;
  }

  // A corrupted host can concatenate the complete hostname without a dot at
  // the join (`a.coma.com`). Check every dot-boundary suffix so a legitimate
  // prefix cannot hide a repeated unit (`sub.a.coma.com`).
  for (let suffixStart = 0; suffixStart < labels.length; suffixStart += 1) {
    if (hasRepeatedStringUnit(labels.slice(suffixStart).join("."))) return true;
  }
  return false;
}

export function assertMintableUrl(raw: string, label: string): URL {
  if (typeof raw !== "string" || /\s/.test(raw)) {
    throw new OnboardingMintError(label, "it must not contain whitespace");
  }
  if (raw.includes(",")) {
    throw new OnboardingMintError(label, "it must not contain commas");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new OnboardingMintError(label, "it must be an absolute URL");
  }

  if (parsed.username || parsed.password) {
    throw new OnboardingMintError(label, "embedded credentials are not allowed");
  }
  if (!/^[A-Za-z0-9.:/?#&=_~-]+$/.test(raw)) {
    throw new OnboardingMintError(label, "it contains unsupported characters");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!hostname || (!isLocalhost && !/^[a-z0-9.-]+$/i.test(hostname))) {
    throw new OnboardingMintError(label, "its hostname contains unsupported characters");
  }
  if (hasRepeatedHostnameSegment(hostname)) {
    throw new OnboardingMintError(label, "its hostname appears to contain a doubled host");
  }
  if (!isLocalhost && parsed.protocol !== "https:") {
    throw new OnboardingMintError(label, "non-localhost URLs must use https");
  }

  return parsed;
}

export function createAgentOnboardingToken(input: CreateAgentOnboardingTokenInput): {
  token: string;
  payload: AgentOnboardingTokenPayload;
} {
  const memroosUrl = normalizeUrl(input.memroosUrl);
  assertMintableUrl(memroosUrl, "memroosUrl");
  const mcpUrl = input.mcpUrl ? normalizeUrl(input.mcpUrl) : `${memroosUrl}/mcp`;
  assertMintableUrl(mcpUrl, "mcpUrl");
  const payload: AgentOnboardingTokenPayload = {
    version: 1,
    kid: signingKeyId(),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    memroosUrl,
    mcpUrl,
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
    const unverifiedPayload = decodeBase64UrlJson<Partial<AgentOnboardingTokenPayload>>(body);
    const payloadKid =
      typeof unverifiedPayload?.kid === "string" && /^[0-9a-f]{8}$/i.test(unverifiedPayload.kid)
        ? unverifiedPayload.kid
        : null;
    const serverKid = signingKeyId();
    if (payloadKid && payloadKid !== serverKid) {
      return {
        ok: false,
        error: `Invalid onboarding token signature (token kid ${payloadKid}, server kid ${serverKid})`,
      };
    }
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
