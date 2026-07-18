import type { HealthStatus } from "@/types";

/** Operator-facing storage backends — these must panic when not up. */
export const STORAGE_SERVICE_NAMES = [
  "mem0",
  "Graph Memory",
  "Knowledge Index",
  "QMD",
] as const;

export type StorageServiceName = (typeof STORAGE_SERVICE_NAMES)[number];

export type StorageAlertSeverity = "panic" | "warn";

export interface StorageAlert {
  service: string;
  status: HealthStatus["status"];
  severity: StorageAlertSeverity;
  detail: string;
}

export function isStorageService(name: string): boolean {
  return (STORAGE_SERVICE_NAMES as readonly string[]).includes(name);
}

/**
 * Storage that is down / not configured / explicitly offline must panic.
 * Soft mem0 disk advisories stay warn-level so we don't cry wolf.
 */
export function classifyStorageAlerts(services: HealthStatus[]): StorageAlert[] {
  const alerts: StorageAlert[] = [];

  for (const service of services) {
    if (!isStorageService(service.service)) continue;

    const detail = (service.detail || "").trim();
    const detailLower = detail.toLowerCase();

    if (service.status === "down") {
      alerts.push({
        service: service.service,
        status: service.status,
        severity: "panic",
        detail: detail || `${service.service} is down — memory may not be storing`,
      });
      continue;
    }

    if (service.status === "degraded") {
      const offlineLike =
        /not configured|offline|unavailable|forbidden|unauthorized|paused|dns|timeout|not storing|write failed/i.test(
          detailLower
        );
      alerts.push({
        service: service.service,
        status: service.status,
        severity: offlineLike ? "panic" : "warn",
        detail: detail || `${service.service} is degraded`,
      });
    }
  }

  return alerts;
}

export function storagePanicAlerts(services: HealthStatus[]): StorageAlert[] {
  return classifyStorageAlerts(services).filter((alert) => alert.severity === "panic");
}

export function hasStoragePanic(services: HealthStatus[]): boolean {
  return storagePanicAlerts(services).length > 0;
}
