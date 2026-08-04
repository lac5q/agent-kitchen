import crypto from "crypto";
import { registerAgent } from "@/lib/agent/registry";
import type {
  AgentLocation,
  AgentPlatform,
  RegisterAgentResult,
  RegisteredAgentCapability,
} from "@/types";
import { getA2aConfig, type A2aConfig } from "./config";
import { A2aError } from "./errors";
import type { A2aAgentCard, A2aAgentSkill } from "./types";

const MAX_AGENT_CARD_BYTES = 262_144;
const METADATA_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

interface IngestA2aAgentCardInput {
  cardUrl: string;
  requestedId?: string;
  issueApiKey?: boolean;
  source?: "adk" | "a2a" | "manual";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new A2aError("INVALID_REQUEST", `A2A agent card is missing ${key}`);
  }
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return false;
}

function cardContainsAdk(card: A2aAgentCard): boolean {
  return JSON.stringify(card.extensions ?? {}).toLowerCase().includes("adk");
}

function platformForCard(card: A2aAgentCard, source: IngestA2aAgentCardInput["source"]): AgentPlatform {
  return source === "adk" || cardContainsAdk(card) ? "gemini" : "openclaw";
}

function locationForEndpoint(endpointUrl: string): AgentLocation {
  const url = new URL(endpointUrl);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return "local";
  }
  return url.protocol === "https:" ? "cloudflare" : "tailscale";
}

function deterministicA2aAgentId(cardUrl: string): string {
  return `a2a_${crypto.createHash("sha256").update(cardUrl).digest("hex").slice(0, 12)}`;
}

function cardHash(card: A2aAgentCard): string {
  return crypto.createHash("sha256").update(JSON.stringify(card)).digest("hex");
}

function normalizeSkill(value: unknown): A2aAgentSkill | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name : id;
  if (!id || !name) return null;

  return {
    id,
    name,
    description: typeof value.description === "string" ? value.description : "",
    tags: stringArray(value.tags),
    examples: stringArray(value.examples),
    inputModes: stringArray(value.inputModes),
    outputModes: stringArray(value.outputModes),
  };
}

function normalizeCapabilities(skills: A2aAgentSkill[], source: IngestA2aAgentCardInput["source"]): RegisteredAgentCapability[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: Array.from(new Set([...(skill.tags ?? []), "a2a", ...(source === "adk" ? ["adk"] : [])])),
  }));
}

function stableMemroosId(card: A2aAgentCard): string | null {
  const memroos = card.extensions?.memroos;
  if (!isRecord(memroos)) return null;
  return typeof memroos.id === "string" && memroos.id.trim() ? memroos.id : null;
}

export function validateA2aAgentCard(value: unknown): A2aAgentCard {
  if (!isRecord(value)) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card must be an object");
  }

  const name = requireString(value, "name");
  const description = typeof value.description === "string" ? value.description : "";
  const url = requireString(value, "url");
  const version = requireString(value, "version");
  const skills = Array.isArray(value.skills) ? value.skills.map(normalizeSkill).filter(Boolean) : [];
  if (skills.length === 0) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card must include at least one skill");
  }

  try {
    new URL(url);
  } catch {
    throw new A2aError("INVALID_REQUEST", "A2A agent card url must be a valid URL");
  }

  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};

  return {
    name,
    description,
    url,
    version,
    preferredTransport:
      value.preferredTransport === "JSON-RPC" || value.preferredTransport === "HTTP+JSON"
        ? value.preferredTransport
        : "HTTP+JSON",
    capabilities: {
      streaming: capabilities.streaming === true,
      pushNotifications: capabilities.pushNotifications === true,
      stateTransitionHistory: capabilities.stateTransitionHistory === true,
    },
    defaultInputModes: stringArray(value.defaultInputModes),
    defaultOutputModes: stringArray(value.defaultOutputModes),
    securitySchemes: isRecord(value.securitySchemes)
      ? (value.securitySchemes as A2aAgentCard["securitySchemes"])
      : {},
    security: Array.isArray(value.security)
      ? value.security.filter((item): item is Record<string, string[]> => isRecord(item))
      : [],
    skills: skills as A2aAgentSkill[],
    extensions: isRecord(value.extensions) ? (value.extensions as A2aAgentCard["extensions"]) : { memroos: { profile: "custom", cardPaths: { canonical: "", compatibility: "" } } },
  };
}

export function isAllowedAgentCardUrl(rawUrl: string, config: A2aConfig = getA2aConfig()): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  if (METADATA_HOSTS.has(hostname)) return false;
  if (!config.allowPrivateNetworkCards && isPrivateNetworkHost(hostname)) return false;

  return true;
}

export async function fetchA2aAgentCard(
  cardUrl: string,
  config: A2aConfig = getA2aConfig()
): Promise<A2aAgentCard> {
  if (!isAllowedAgentCardUrl(cardUrl, config)) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card URL is not allowed");
  }

  const response = await fetch(cardUrl, {
    signal: AbortSignal.timeout(config.remoteCardTimeoutMs),
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card could not be fetched");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_AGENT_CARD_BYTES) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card response is too large");
  }

  const text = (await response.text()).slice(0, MAX_AGENT_CARD_BYTES + 1);
  if (text.length > MAX_AGENT_CARD_BYTES) {
    throw new A2aError("INVALID_REQUEST", "A2A agent card response is too large");
  }

  try {
    return validateA2aAgentCard(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof A2aError) throw error;
    throw new A2aError("INVALID_REQUEST", "A2A agent card response is not valid JSON");
  }
}

export async function ingestA2aAgentCard(
  input: IngestA2aAgentCardInput
): Promise<RegisterAgentResult> {
  const source = input.source ?? "a2a";
  const card = await fetchA2aAgentCard(input.cardUrl);
  const endpoint = new URL(card.url);
  const location = locationForEndpoint(card.url);
  const id = input.requestedId ?? stableMemroosId(card) ?? deterministicA2aAgentId(input.cardUrl);

  return registerAgent({
    id,
    name: card.name,
    role: card.description || "A2A-compatible remote agent",
    platform: platformForCard(card, source),
    protocol: "a2a",
    location,
    host: endpoint.hostname,
    port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80,
    healthEndpoint: "/.well-known/agent-card.json",
    tunnelUrl: location === "cloudflare" ? card.url : undefined,
    capabilities: normalizeCapabilities(card.skills, source),
    metadata: {
      a2a: {
        cardUrl: input.cardUrl,
        endpointUrl: card.url,
        version: card.version,
        securitySchemes: card.securitySchemes,
        inputModes: card.defaultInputModes,
        outputModes: card.defaultOutputModes,
        validationStatus: "validated",
        cardHash: cardHash(card),
        lastFetchedAt: new Date().toISOString(),
        source,
      },
    },
    issueApiKey: input.issueApiKey ?? false,
  });
}
