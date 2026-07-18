import { describe, expect, it } from "vitest";
import {
  classifyStorageAlerts,
  hasStoragePanic,
  storagePanicAlerts,
} from "@/lib/storage-health";
import type { HealthStatus } from "@/types";

function svc(service: string, status: HealthStatus["status"], detail?: string): HealthStatus {
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
    expect(
      hasStoragePanic([svc("QMD", "down", "Command failed: which qmd")])
    ).toBe(false);
    expect(
      classifyStorageAlerts([
        svc("QMD", "degraded", "optional — qmd binary not installed"),
      ])
    ).toEqual([]);
  });
});
