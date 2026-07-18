import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addMemory,
  buildContextInjection,
  memoryTool,
  purgeExpiredMemories,
  searchMemories,
} from "../memory-client";

let tempRoot: string | null = null;

function root() {
  tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-memory-"));
  return tempRoot;
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("Hermes memory client v2", () => {
  it("returns semantic matches with no exact keyword overlap", () => {
    const hermesRoot = root();
    addMemory(hermesRoot, { content: "Use env driven provider settings for model routing.", tags: ["config"] });

    const results = searchMemories(hermesRoot, "how to configure models", { limit: 3 });

    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
    expect(results[0].content).toContain("provider settings");
  });

  it("caps context injection and merges duplicate memories", () => {
    const hermesRoot = root();
    const first = addMemory(hermesRoot, { content: "A/B tests should retain experiment decisions.", tags: ["product"] });
    const merged = addMemory(hermesRoot, { content: "A/B tests should retain experiment decisions.", tags: ["product"] });

    expect(first.id).toBe(merged.id);
    expect(merged.mergeCount).toBe(2);

    for (let i = 0; i < 30; i++) {
      addMemory(hermesRoot, { content: `A/B experiment memory ${i} with useful but repeated context.` });
    }

    const injection = buildContextInjection(hermesRoot, "A/B tests", { maxChars: 1500 });
    expect(injection.text.length).toBeLessThanOrEqual(1500);
    expect(injection.memories.every((memory) => memory.score >= 0.5)).toBe(true);
    expect(injection.recollection.decision).toBe("search_required");
    expect(injection.contextPack.injected.length).toBeGreaterThan(0);
  });

  it("records skipped recollection when callers mark a mechanical task as entity-free", () => {
    const hermesRoot = root();
    addMemory(hermesRoot, { content: "Formatting requests should not force memory retrieval." });

    const injection = buildContextInjection(hermesRoot, "format this list", {
      entities: [],
    });

    expect(injection.text).toBe("");
    expect(injection.memories).toHaveLength(0);
    expect(injection.recollection.decision).toBe("search_skipped");
    expect(injection.recollection.skipReason).toContain("local or mechanical");
    expect(injection.contextPack.injected).toHaveLength(0);
  });

  it("excludes policy-denied memories from recollection context packs", () => {
    const hermesRoot = root();
    const allowed = addMemory(hermesRoot, {
      content: "A/B tests keep launch decisions in the experiment tracker.",
      authorization: "allowed",
    });
    const denied = addMemory(hermesRoot, {
      content: "A/B tests contain private payment escalation notes.",
      authorization: "denied",
      policyRisk: "high",
    });

    const injection = buildContextInjection(hermesRoot, "A/B tests", {
      maxChars: 1500,
    });

    expect(injection.text).toContain(allowed.content);
    expect(injection.text).not.toContain(denied.content);
    expect(injection.memories.map((memory) => memory.id)).toContain(allowed.id);
    expect(injection.memories.map((memory) => memory.id)).not.toContain(denied.id);
    expect(injection.contextPack.ignored).toContainEqual(
      expect.objectContaining({ id: denied.id, reason: "policy_denied" })
    );
  });

  it("preserves belief-stage caveats for silver memories", () => {
    const hermesRoot = root();
    const silver = addMemory(hermesRoot, {
      content: "Cordant follow-up requires a Google Docs owner check before sharing.",
      beliefStage: "silver_candidate_claim",
      tags: ["cordant"],
    });

    const injection = buildContextInjection(hermesRoot, "Cordant follow-up owner check", {
      project: "cordant",
    });

    expect(injection.text).toContain(silver.content);
    expect(injection.contextPack.injected).toContainEqual(
      expect.objectContaining({
        id: silver.id,
        reliance: "caveated_claim",
        caveatReason: expect.stringContaining("Silver candidate claim"),
      })
    );
  });

  it("archives expired memories and keeps backward-compatible memory tool calls", () => {
    const hermesRoot = root();
    const expired = addMemory(hermesRoot, {
      content: "temporary fact",
      ttlDays: 1,
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });

    const compat = memoryTool(hermesRoot, {
      action: "add",
      target: "memory",
      content: "legacy compatible fact",
    });
    expect(compat.ok).toBe(true);

    const purged = purgeExpiredMemories(hermesRoot, new Date());
    expect(purged.archived).toContain(expired.id);
    expect(searchMemories(hermesRoot, "legacy compatible fact")).toHaveLength(1);
  });

  it("recovers from a corrupt store by treating it as empty", () => {
    const hermesRoot = root();
    mkdirSync(path.join(hermesRoot, "memory", "v2"), { recursive: true });
    writeFileSync(path.join(hermesRoot, "memory", "v2", "memories.json"), "not-json");

    expect(searchMemories(hermesRoot, "anything")).toEqual([]);

    const added = addMemory(hermesRoot, { content: "fresh memory after corruption" });
    expect(added.content).toBe("fresh memory after corruption");
    expect(JSON.parse(readFileSync(path.join(hermesRoot, "memory", "v2", "memories.json"), "utf8"))).toHaveLength(1);
  });

  it("keeps ttlDays=0 memories and supports replace/remove tool actions", () => {
    const hermesRoot = root();
    const retained = addMemory(hermesRoot, {
      content: "do not expire this runtime memory",
      ttlDays: 0,
      createdAt: new Date(Date.now() - 365 * 86_400_000).toISOString(),
    });
    const replace = memoryTool(hermesRoot, {
      action: "replace",
      id: retained.id,
      content: "updated non-expiring runtime memory",
    });
    expect(replace).toEqual({ ok: true });

    const purged = purgeExpiredMemories(hermesRoot, new Date());
    expect(purged.archived).not.toContain(retained.id);
    expect(searchMemories(hermesRoot, "updated non-expiring runtime memory", { threshold: 0.1 })).toHaveLength(1);

    const remove = memoryTool(hermesRoot, { action: "remove", id: retained.id });
    expect(remove).toEqual({ ok: true });
    expect(searchMemories(hermesRoot, "updated non-expiring runtime memory", { threshold: 0.1 })).toEqual([]);
  });

  it("rejects incomplete memory tool mutations", () => {
    const hermesRoot = root();
    expect(memoryTool(hermesRoot, { action: "add" })).toEqual({
      ok: false,
      error: "content is required",
    });
    expect(memoryTool(hermesRoot, { action: "replace", id: "missing" })).toEqual({
      ok: false,
      error: "id and content are required",
    });
  });
});
