// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";
import { seedRegisteredAgents } from "@/lib/agent-registry-seed";

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "agent-registry-seed-"));
const ORIGINAL_ROOT = process.env.MEMROOS_ROOT;
const ORIGINAL_SEED_FLAG = process.env.MEMROOS_SEED_REGISTERED_AGENTS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function writeConfig(content: unknown): void {
  fs.writeFileSync(path.join(TMP_ROOT, "agents.config.json"), JSON.stringify(content));
}

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

beforeEach(() => {
  process.env.MEMROOS_ROOT = TMP_ROOT;
  process.env.MEMROOS_SEED_REGISTERED_AGENTS = "1";
  delete process.env.NODE_ENV;
  // Reset config file to empty between tests
  fs.rmSync(path.join(TMP_ROOT, "agents.config.json"), { force: true });
});

afterEach(() => {
  if (ORIGINAL_ROOT === undefined) delete process.env.MEMROOS_ROOT;
  else process.env.MEMROOS_ROOT = ORIGINAL_ROOT;
  if (ORIGINAL_SEED_FLAG === undefined) delete process.env.MEMROOS_SEED_REGISTERED_AGENTS;
  else process.env.MEMROOS_SEED_REGISTERED_AGENTS = ORIGINAL_SEED_FLAG;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

afterAll(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("seedRegisteredAgents — gating", () => {
  it("does nothing when MEMROOS_SEED_REGISTERED_AGENTS is unset and NODE_ENV is not production", () => {
    delete process.env.MEMROOS_SEED_REGISTERED_AGENTS;
    delete process.env.NODE_ENV;
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent",
          role: "worker",
          platform: "droid",
          protocol: "rest",
          location: "local",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("seeds when MEMROOS_SEED_REGISTERED_AGENTS=1", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          protocol: "rest",
          location: "local",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(1);
  });

  it("seeds when NODE_ENV=production and no explicit flag is set", () => {
    delete process.env.MEMROOS_SEED_REGISTERED_AGENTS;
    process.env.NODE_ENV = "production";
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          protocol: "rest",
          location: "local",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect((rows.c as unknown as number)).toBe(1);
  });

  it("treats MEMROOS_SEED_REGISTERED_AGENTS=0 as off", () => {
    process.env.MEMROOS_SEED_REGISTERED_AGENTS = "0";
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("treats MEMROOS_SEED_REGISTERED_AGENTS=true (case insensitive) as on", () => {
    process.env.MEMROOS_SEED_REGISTERED_AGENTS = "TRUE";
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(1);
  });
});

describe("seedRegisteredAgents — config parsing", () => {
  it("does nothing when agents.config.json is missing", () => {
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("does nothing when agents.config.json is malformed JSON", () => {
    fs.writeFileSync(path.join(TMP_ROOT, "agents.config.json"), "{not valid json}");
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("does nothing when remoteAgents is missing", () => {
    writeConfig({ notRemoteAgents: [] });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("does nothing when remoteAgents is not an array", () => {
    writeConfig({ remoteAgents: "not-an-array" });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number };
    expect(rows.c).toBe(0);
  });

  it("skips invalid agents but inserts valid ones", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "valid",
          name: "Valid Agent",
          role: "worker",
          platform: "droid",
        },
        {
          id: "bad-platform",
          name: "Bad",
          role: "worker",
          platform: "not-a-platform",
        },
        {
          id: "",
          name: "Empty ID",
          role: "worker",
          platform: "droid",
        },
        {
          id: "valid-2",
          name: "Another Valid",
          role: "worker",
          platform: "pi",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT id FROM registered_agents ORDER BY id").all() as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(["valid", "valid-2"]);
  });
});

describe("seedRegisteredAgents — row content", () => {
  it("defaults protocol=rest and location=local", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT * FROM registered_agents WHERE id = ?").get("agent-1") as Record<string, unknown>;
    expect(row.protocol).toBe("rest");
    expect(row.location).toBe("local");
  });

  it("trims string fields", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "  agent-1  ",
          name: "  Agent One  ",
          role: "  worker  ",
          platform: "droid",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT id, name, role FROM registered_agents WHERE id = ?").get("agent-1") as Record<string, unknown>;
    expect(row).toEqual({ id: "agent-1", name: "Agent One", role: "worker" });
  });

  it("captures host, port, healthEndpoint, tunnelUrl", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          protocol: "a2a",
          location: "cloudflare",
          host: "  host.example.com  ",
          port: 4100,
          healthEndpoint: "/health",
          tunnelUrl: "https://tunnel.example.com",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT host, port, health_endpoint, tunnel_url, protocol, location FROM registered_agents WHERE id = ?").get("agent-1") as Record<string, unknown>;
    expect(row).toEqual({
      host: "host.example.com",
      port: 4100,
      health_endpoint: "/health",
      tunnel_url: "https://tunnel.example.com",
      protocol: "a2a",
      location: "cloudflare",
    });
  });

  it("sets status to dormant on insert", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT status FROM registered_agents WHERE id = ?").get("agent-1") as { status: string };
    expect(row.status).toBe("dormant");
  });

  it("stores metadata with seededFrom marker", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          metadata: { region: "us-east-1" },
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT metadata FROM registered_agents WHERE id = ?").get("agent-1") as { metadata: string };
    const parsed = JSON.parse(row.metadata);
    expect(parsed.region).toBe("us-east-1");
    expect(parsed.seededFrom).toBe("agents.config.json");
  });

  it("stores empty-object metadata when missing or invalid", () => {
    writeConfig({
      remoteAgents: [
        { id: "a1", name: "A", role: "w", platform: "droid", metadata: "not-an-object" },
        { id: "a2", name: "B", role: "w", platform: "droid" },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT id, metadata FROM registered_agents ORDER BY id").all() as Array<{ id: string; metadata: string }>;
    expect(JSON.parse(rows[0].metadata)).toEqual({ seededFrom: "agents.config.json" });
    expect(JSON.parse(rows[1].metadata)).toEqual({ seededFrom: "agents.config.json" });
  });
});

describe("seedRegisteredAgents — capabilities", () => {
  it("inserts valid capabilities and skips invalid ones", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          capabilities: [
            { id: "good", name: "Good", description: "d", tags: ["a"] },
            { id: "", name: "no-id" },
            { id: "no-name", name: "" },
            null,
          ],
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const rows = db.prepare("SELECT capability_id, name, description, tags FROM agent_capabilities WHERE agent_id = ?").all("agent-1") as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      capability_id: "good",
      name: "Good",
      description: "d",
      tags: JSON.stringify(["a"]),
    });
  });

  it("upserts capabilities on conflict (same agent_id + capability_id)", () => {
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          capabilities: [{ id: "cap-1", name: "V1", description: "old" }],
        },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    // Re-write config with same id, different content
    writeConfig({
      remoteAgents: [
        {
          id: "agent-1",
          name: "Agent One",
          role: "worker",
          platform: "droid",
          capabilities: [{ id: "cap-1", name: "V2", description: "new" }],
        },
      ],
    });
    seedRegisteredAgents(db);
    const row = db.prepare("SELECT name, description FROM agent_capabilities WHERE agent_id = ? AND capability_id = ?").get("agent-1", "cap-1") as Record<string, unknown>;
    expect(row).toEqual({ name: "V2", description: "new" });
  });
});

describe("seedRegisteredAgents — atomicity", () => {
  it("inserts all agents in a single transaction (rollback on failure)", () => {
    writeConfig({
      remoteAgents: [
        { id: "a1", name: "A", role: "w", platform: "droid" },
        { id: "a2", name: "B", role: "w", platform: "pi" },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    const count = (db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it("does not duplicate on second invocation (ON CONFLICT DO NOTHING)", () => {
    writeConfig({
      remoteAgents: [
        { id: "a1", name: "A", role: "w", platform: "droid" },
      ],
    });
    const db = freshDb();
    seedRegisteredAgents(db);
    seedRegisteredAgents(db);
    const count = (db.prepare("SELECT COUNT(*) AS c FROM registered_agents").get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
