import { describe, expect, it } from "vitest";

import {
  STORAGE_SERVICE_NAMES,
  classifyStorageAlerts,
  hasStoragePanic,
  isStorageService,
  storagePanicAlerts,
} from "@/lib/storage-health";
import type { HealthStatus } from "@/types";

function svc(
  service: string,
  status: HealthStatus["status"],
  detail?: string,
): HealthStatus {
  return {
    service,
    status,
    latencyMs: 1,
    lastCheck: "2026-07-17T00:00:00.000Z",
    detail,
  };
}

describe("storage-health", () => {
  it("ignores non-storage services", () => {
    const alerts = classifyStorageAlerts([
      svc("RTK", "down", "missing"),
      svc("APO", "down"),
      svc("Agents", "degraded"),
    ]);
    expect(alerts).toEqual([]);
    expect(hasStoragePanic([svc("RTK", "down")])).toBe(false);
  });

  it("panics when Graph Memory is down", () => {
    const services = [svc("Graph Memory", "down", "Neo4j unavailable")];
    expect(hasStoragePanic(services)).toBe(true);
    expect(storagePanicAlerts(services)[0]?.service).toBe("Graph Memory");
  });

  it("panics when Neo4j is not configured (treated as offline storage)", () => {
    const services = [
      svc("Graph Memory", "degraded", "Neo4j is not configured; graph memory tier is offline"),
    ];
    expect(storagePanicAlerts(services)).toHaveLength(1);
    expect(storagePanicAlerts(services)[0]?.severity).toBe("panic");
  });

  it("warns but does not panic on soft mem0 disk advisory", () => {
    const services = [svc("mem0", "degraded", "mem0 reports degraded")];
    const alerts = classifyStorageAlerts(services);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("warn");
    expect(hasStoragePanic(services)).toBe(false);
  });

  it("panics on mem0 down", () => {
    expect(hasStoragePanic([svc("mem0", "down", "HTTP 503")])).toBe(true);
  });

  it("does not panic when optional QMD is down or missing", () => {
    expect(hasStoragePanic([svc("QMD", "down", "Command failed: which qmd")])).toBe(false);
    expect(
      classifyStorageAlerts([svc("QMD", "degraded", "optional — qmd binary not installed")]),
    ).toEqual([]);
  });

  it("falls back to a generated detail when a storage service is down without one", () => {
    const alerts = classifyStorageAlerts([svc("mem0", "down", "")]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("panic");
    expect(alerts[0]?.detail).toBe("mem0 is down — memory may not be storing");
    expect(alerts[0]?.status).toBe("down");
  });

  it("uses the service detail verbatim when a storage service is degraded", () => {
    const alerts = classifyStorageAlerts([svc("Graph Memory", "degraded", "Neo4j timeout")]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.detail).toBe("Neo4j timeout");
  });

  it("flags every offline-keyword degraded storage status as panic", () => {
    const samples: Array<[string, string]> = [
      ["Graph Memory", "service not configured"],
      ["Graph Memory", "offline replica"],
      ["Graph Memory", "unavailable backends"],
      ["Graph Memory", "forbidden access"],
      ["Graph Memory", "unauthorized request"],
      ["Graph Memory", "index paused"],
      ["Graph Memory", "DNS lookup failed"],
      ["Graph Memory", "connect timeout"],
      ["Graph Memory", "not storing data"],
      ["Graph Memory", "write failed on disk"],
    ];

    const alerts = samples.map(([name, detail]) =>
      classifyStorageAlerts([svc(name, "degraded", detail)]),
    );

    for (const [index] of samples.entries()) {
      expect(alerts[index]).toHaveLength(1);
      expect(alerts[index]?.[0]?.severity).toBe("panic");
    }
  });

  it("exposes the storage service allowlist", () => {
    expect([...STORAGE_SERVICE_NAMES]).toEqual(["mem0", "Graph Memory", "Knowledge Index"]);
  });

  it("matches the storage allowlist with isStorageService (and rejects unknown names)", () => {
    expect(isStorageService("mem0")).toBe(true);
    expect(isStorageService("Graph Memory")).toBe(true);
    expect(isStorageService("Knowledge Index")).toBe(true);
    expect(isStorageService("agents")).toBe(false);
    expect(isStorageService("RTK")).toBe(false);
    expect(isStorageService("")).toBe(false);
  });

  it("does not panic when no storage services are present", () => {
    const alerts = classifyStorageAlerts([
      svc("Neo4j", "up"),
      svc("Qdrant", "up"),
      svc("OpenAI", "up"),
    ]);
    expect(alerts).toEqual([]);
    expect(hasStoragePanic([])).toBe(false);
  });
});
