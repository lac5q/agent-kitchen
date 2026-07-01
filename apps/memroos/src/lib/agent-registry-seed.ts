import type Database from "better-sqlite3";
import fs from "fs";
import type { AgentLocation, AgentPlatform, AgentProtocol } from "@/types";
import { findConfigFile } from "@/lib/paths";

const VALID_PLATFORMS = new Set<AgentPlatform>([
  "cursor",
  "claude",
  "codex",
  "qwen",
  "gemini",
  "opencode",
  "hermes",
  "openclaw",
  "chatgpt",
  "cortex",
]);
const VALID_PROTOCOLS = new Set<AgentProtocol>(["rest", "a2a", "ui", "local"]);
const VALID_LOCATIONS = new Set<AgentLocation>(["local", "tailscale", "cloudflare"]);

interface SeedAgent {
  id: string;
  name: string;
  role: string;
  platform: AgentPlatform;
  protocol: AgentProtocol;
  location: AgentLocation;
  host: string | null;
  port: number | null;
  healthEndpoint: string | null;
  tunnelUrl: string | null;
  metadata: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalPort(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseSeedAgent(value: unknown): SeedAgent | null {
  if (!isRecord(value)) return null;
  const { id, name, role, platform } = value;
  const protocol = typeof value.protocol === "string" ? value.protocol : "rest";
  const location = typeof value.location === "string" ? value.location : "local";

  if (typeof id !== "string" || !id.trim()) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof role !== "string" || !role.trim()) return null;
  if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform as AgentPlatform)) return null;
  if (!VALID_PROTOCOLS.has(protocol as AgentProtocol)) return null;
  if (!VALID_LOCATIONS.has(location as AgentLocation)) return null;

  return {
    id: id.trim(),
    name: name.trim(),
    role: role.trim(),
    platform: platform as AgentPlatform,
    protocol: protocol as AgentProtocol,
    location: location as AgentLocation,
    host: optionalString(value.host),
    port: optionalPort(value.port),
    healthEndpoint: optionalString(value.healthEndpoint),
    tunnelUrl: optionalString(value.tunnelUrl),
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

function shouldSeedRegisteredAgents(): boolean {
  const explicit = process.env.MEMROOS_SEED_REGISTERED_AGENTS?.trim().toLowerCase();
  if (explicit) return ["1", "true", "yes", "on"].includes(explicit);
  return process.env.NODE_ENV === "production";
}

export function seedRegisteredAgents(db: Database.Database): void {
  if (!shouldSeedRegisteredAgents()) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(findConfigFile("agents.config.json"), "utf8"));
  } catch {
    return;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.remoteAgents)) return;

  const agents = parsed.remoteAgents.map(parseSeedAgent).filter((agent): agent is SeedAgent => Boolean(agent));
  if (agents.length === 0) return;

  const timestamp = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO registered_agents (
       id, name, role, company, platform, protocol, status, current_task,
       last_heartbeat_at, location, host, port, health_endpoint, tunnel_url,
       latency_ms, metadata, created_at, updated_at, deregistered_at
     )
     VALUES (
       @id, @name, @role, NULL, @platform, @protocol, 'dormant', NULL,
       NULL, @location, @host, @port, @healthEndpoint, @tunnelUrl,
       NULL, @metadata, @timestamp, @timestamp, NULL
     )
     ON CONFLICT(id) DO NOTHING`
  );

  const tx = db.transaction(() => {
    for (const agent of agents) {
      insert.run({
        ...agent,
        metadata: JSON.stringify({
          ...agent.metadata,
          seededFrom: "agents.config.json",
        }),
        timestamp,
      });
    }
  });
  tx();
}
