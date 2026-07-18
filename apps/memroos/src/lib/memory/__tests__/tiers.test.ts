import { describe, expect, it } from "vitest";
import { resolveMemoryTier, buildTieredMemoryPayload } from "../tiers";

describe("memory tier routing", () => {
  it("honors explicit vector, graph, and episodic types", () => {
    expect(resolveMemoryTier({ type: "vector", content: "semantic fact" })).toBe("vector");
    expect(resolveMemoryTier({ type: "graph", content: "Luis works_with Codex" })).toBe("graph");
    expect(resolveMemoryTier({ type: "episodic", content: "session event" })).toBe("episodic");
  });

  it("maps legacy memory types to stable tiers", () => {
    expect(resolveMemoryTier({ type: "semantic" })).toBe("vector");
    expect(resolveMemoryTier({ type: "fact" })).toBe("vector");
    expect(resolveMemoryTier({ type: "relationship" })).toBe("graph");
    expect(resolveMemoryTier({ type: "entity" })).toBe("graph");
    expect(resolveMemoryTier({ type: "event" })).toBe("episodic");
    expect(resolveMemoryTier({ type: "conversation" })).toBe("episodic");
    expect(resolveMemoryTier({ type: "note" })).toBe("episodic");
  });

  it("falls back to metadata tier and defaults malformed payloads to episodic", () => {
    expect(resolveMemoryTier({ metadata: { tier: "FACT" } })).toBe("vector");
    expect(resolveMemoryTier({ metadata: { tier: "unknown" } })).toBe("episodic");
    expect(resolveMemoryTier({ metadata: ["not", "record"] })).toBe("episodic");
  });

  it("adds tier metadata without dropping caller metadata", () => {
    expect(
      buildTieredMemoryPayload({ content: "Luis founded Memroos", type: "graph", metadata: { source: "test" } })
    ).toMatchObject({
      content: "Luis founded Memroos",
      type: "graph",
      metadata: { source: "test", tier: "graph", backend: "mem0-neo4j" },
    });
  });
});
