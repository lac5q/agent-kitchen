import { describe, expect, it } from "vitest";
import { loadMemroosEnv, reconcileRootConfigStatus, validateMemroosEnvAtStartup } from "../env";

describe("loadMemroosEnv", () => {
  it("applies local development defaults", () => {
    const env = loadMemroosEnv({ HOME: "/Users/USERNAME" });

    expect(env.MEM0_URL).toBe("http://localhost:3201");
    expect(env.MEM0_PORT).toBe(3201);
    expect(env.SQLITE_DB_PATH).toBe("data/conversations.db");
    expect(env.AGENT_CONFIGS_PATH).toBe("/Users/USERNAME/github/knowledge/agent-configs");
    expect(env.CLAUDE_MEMORY_PATH).toBe("/Users/USERNAME/.claude/projects");
    expect(env.CODEX_MEMORY_PATH).toBe("/Users/USERNAME/.codex/sessions");
    expect(env.KNOWLEDGE_BASE_PATH).toBe("/Users/USERNAME/github/knowledge");
    expect(env.COLLECTIONS_CONFIG_PATH).toBe("collections.config.json");
    expect(env.CONTEXT_SOURCES_CONFIG).toBe("context-sources.config.json");
    expect(env.MEMROOS_A2A_PROFILE).toBe("local-dev");
    expect(env.MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS).toBe(5000);
    expect(env.MEMROOS_EMBEDDING_PROVIDER).toBe("null");
    expect(env.OLLAMA_URL).toBe("http://localhost:11434");
  });

  it("preserves explicit configured values", () => {
    const env = loadMemroosEnv({
      HOME: "/Users/USERNAME",
      MEM0_URL: "http://127.0.0.1:3201",
      MEM0_PORT: "3211",
      SQLITE_DB_PATH: "/tmp/memroos.db",
      HERMES_MEMORY_PATH: "/tmp/hermes",
      COLLECTIONS_CONFIG_PATH: "/tmp/collections.json",
      CONTEXT_SOURCES_CONFIG: "/tmp/context-sources.json",
      MEMROOS_A2A_PROFILE: "cloud-https",
      MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS: "1250",
      MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS: "false",
      MEMROOS_EMBEDDING_PROVIDER: "ollama",
      OLLAMA_URL: "http://ollama.test:11434",
    });

    expect(env.MEM0_URL).toBe("http://127.0.0.1:3201");
    expect(env.MEM0_PORT).toBe(3211);
    expect(env.SQLITE_DB_PATH).toBe("/tmp/memroos.db");
    expect(env.HERMES_MEMORY_PATH).toBe("/tmp/hermes");
    expect(env.COLLECTIONS_CONFIG_PATH).toBe("/tmp/collections.json");
    expect(env.CONTEXT_SOURCES_CONFIG).toBe("/tmp/context-sources.json");
    expect(env.MEMROOS_A2A_PROFILE).toBe("cloud-https");
    expect(env.MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS).toBe(1250);
    expect(env.MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS).toBe(false);
    expect(env.MEMROOS_EMBEDDING_PROVIDER).toBe("ollama");
    expect(env.OLLAMA_URL).toBe("http://ollama.test:11434");
  });

  it("fails closed on malformed configured values", () => {
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", MEM0_URL: "localhost:3201" })).toThrow(
      /Invalid environment configuration/
    );
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", SQLITE_DB_PATH: "" })).toThrow(
      /Invalid environment configuration/
    );
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", MEMROOS_A2A_PROFILE: "internet" })).toThrow(
      /Invalid environment configuration/
    );
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", MEMROOS_A2A_REMOTE_CARD_TIMEOUT_MS: "0" })).toThrow(
      /Invalid environment configuration/
    );
    expect(() =>
      loadMemroosEnv({ HOME: "/Users/USERNAME", MEMROOS_A2A_ALLOW_PRIVATE_NETWORK_CARDS: "sometimes" })
    ).toThrow(/Invalid environment configuration/);
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", MEMROOS_EMBEDDING_PROVIDER: "qdrant" })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("reconciles root config files with legacy and active roles", () => {
    const statuses = reconcileRootConfigStatus(process.cwd());

    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "agents.config.json",
          role: "legacy",
          canonicalSource: "SQLite agent registry plus A2A card ingestion",
        }),
        expect.objectContaining({
          file: "collections.config.json",
          role: "active",
          canonicalSource: "typed COLLECTIONS_CONFIG_PATH",
        }),
        expect.objectContaining({
          file: "context-sources.config.json",
          role: "active",
          canonicalSource: "typed CONTEXT_SOURCES_CONFIG",
        }),
      ])
    );
  });

  it("validates startup configuration and returns root config status", () => {
    const result = validateMemroosEnvAtStartup({ HOME: "/tmp/memroos-home", MEM0_URL: "http://mem0.test" });

    expect(result.env.MEM0_URL).toBe("http://mem0.test");
    expect(result.rootConfigStatus.map((entry) => entry.file)).toEqual([
      "agents.config.json",
      "collections.config.json",
      "context-sources.config.json",
    ]);
  });
});
