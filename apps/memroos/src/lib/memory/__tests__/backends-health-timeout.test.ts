import { afterEach, describe, expect, it, vi } from "vitest";
import { checkVectorHealth, mem0HealthTimeoutMs } from "../backends";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mem0HealthTimeoutMs", () => {
  it("defaults to 15_000ms when env var is unset", () => {
    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("defaults to 15_000ms when env var is empty string", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("accepts a positive integer override", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "7500";
    expect(mem0HealthTimeoutMs()).toBe(7_500);
  });

  it("accepts a numeric string and truncates fractional values", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "12345.9";
    expect(mem0HealthTimeoutMs()).toBe(12_345);
  });

  it("falls back to 15_000ms when override is zero", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "0";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("falls back to 15_000ms when override is negative", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "-100";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("falls back to 15_000ms when override is NaN", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "not-a-number";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("integrates a live override via direct read", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "20000";
    expect(mem0HealthTimeoutMs()).toBe(20_000);
    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });
});

describe("checkVectorHealth timeout honesty", () => {
  it("reports vector down with timeout detail when the Mem0 probe aborts", async () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "50";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise<void>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("TimeoutError: The operation was aborted due to timeout"));
            return;
          }
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException("The operation was aborted due to timeout", "TimeoutError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(signal.reason ?? new DOMException("The operation was aborted due to timeout", "TimeoutError"));
          });
        });
        return new Response("{}");
      }),
    );

    const health = await checkVectorHealth();
    expect(health.tier).toBe("vector");
    expect(health.status).toBe("down");
    expect(String(health.detail ?? "").toLowerCase()).toMatch(/abort|timeout/);
  });

  it("reports vector up when Mem0 health returns ok within the probe window", async () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "5000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health).toMatchObject({ tier: "vector", backend: "mem0-qdrant", status: "up" });
  });
});
