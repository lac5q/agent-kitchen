// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseCache } from "@/lib/response-cache";

const statsRoute = await import("../stats/route");
const purgeRoute = await import("../purge/route");
const prewarmRoute = await import("../prewarm/route");

describe("cache operations API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes stats, prewarm, and purge controls", async () => {
    const prewarm = await prewarmRoute.POST();
    expect(prewarm.status).toBe(200);
    const prewarmData = await prewarm.json();
    expect(prewarmData.ok).toBe(true);

    const stats = await statsRoute.GET();
    const statsData = await stats.json();
    expect(statsData.stats.entries).toBeGreaterThan(0);
    expect(statsData.performance.ok).toBe(true);

    const purge = await purgeRoute.POST(new Request("http://localhost/api/cache/purge", { method: "POST" }) as any);
    const purgeData = await purge.json();
    expect(purgeData.ok).toBe(true);
    expect(purgeData.purged).toBeGreaterThan(0);
  });

  it("purges only entries matching a requested tag", async () => {
    await responseCache.getOrSet("route-test", "tagged", 30_000, () => ({ ok: true }), ["route-tag"]);
    await responseCache.getOrSet("route-test", "untagged", 30_000, () => ({ ok: true }), ["other-tag"]);

    const purge = await purgeRoute.POST(new Request("http://localhost/api/cache/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: " route-tag " }),
    }) as any);
    const purgeData = await purge.json();
    const stats = await (await statsRoute.GET()).json();

    expect(purge.status).toBe(200);
    expect(purgeData).toMatchObject({ ok: true, purged: 1, tag: "route-tag" });
    expect(stats.stats.entries).toBeGreaterThanOrEqual(1);
  });

  it("returns a structured error when purge throws", async () => {
    vi.spyOn(responseCache, "purge").mockImplementationOnce(() => {
      throw new Error("cache exploded");
    });

    const purge = await purgeRoute.POST(new Request("http://localhost/api/cache/purge", { method: "POST" }) as any);
    const body = await purge.json();

    expect(purge.status).toBe(500);
    expect(body.error).toBe("cache exploded");
  });

  it("reports cold and unavailable cache metric states", async () => {
    vi.spyOn(responseCache, "stats").mockReturnValueOnce({
      entries: 0,
      hits: 0,
      misses: 2,
      keys: [],
    });
    const cold = await (await statsRoute.GET()).json();
    expect(cold.metrics.hitRate).toMatchObject({
      status: "zero",
      value: 0,
    });

    vi.spyOn(responseCache, "stats").mockReturnValueOnce({
      entries: undefined,
      hits: undefined,
      misses: undefined,
      keys: [],
    } as never);
    const unavailable = await (await statsRoute.GET()).json();
    expect(unavailable.metrics.entries).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(unavailable.metrics.hitRate).toMatchObject({
      status: "unavailable",
      value: null,
    });
  });
});
