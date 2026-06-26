import { describe, expect, it } from "vitest";
import { loadMemroosEnv } from "../env";

describe("loadMemroosEnv", () => {
  it("applies local development defaults", () => {
    const env = loadMemroosEnv({ HOME: "/Users/USERNAME" });

    expect(env.MEM0_URL).toBe("http://localhost:3201");
    expect(env.SQLITE_DB_PATH).toBe("data/conversations.db");
    expect(env.AGENT_CONFIGS_PATH).toBe("/Users/USERNAME/github/knowledge/agent-configs");
    expect(env.CLAUDE_MEMORY_PATH).toBe("/Users/USERNAME/.claude/projects");
  });

  it("preserves explicit configured values", () => {
    const env = loadMemroosEnv({
      HOME: "/Users/USERNAME",
      MEM0_URL: "http://127.0.0.1:3201",
      SQLITE_DB_PATH: "/tmp/memroos.db",
      HERMES_MEMORY_PATH: "/tmp/hermes",
    });

    expect(env.MEM0_URL).toBe("http://127.0.0.1:3201");
    expect(env.SQLITE_DB_PATH).toBe("/tmp/memroos.db");
    expect(env.HERMES_MEMORY_PATH).toBe("/tmp/hermes");
  });

  it("fails closed on malformed configured values", () => {
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", MEM0_URL: "localhost:3201" })).toThrow(
      /Invalid environment configuration/
    );
    expect(() => loadMemroosEnv({ HOME: "/Users/USERNAME", SQLITE_DB_PATH: "" })).toThrow(
      /Invalid environment configuration/
    );
  });
});
