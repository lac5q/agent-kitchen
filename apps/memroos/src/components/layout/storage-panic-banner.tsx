"use client";

import Link from "next/link";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { storagePanicAlerts, type StorageAlert } from "@/lib/storage-health";
import type { HealthStatus } from "@/types";

export function StoragePanicBanner({ services }: { services: HealthStatus[] }) {
  const panics = storagePanicAlerts(services);
  if (panics.length === 0) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      data-storage-panic-banner
      className="mb-4 border-2 p-4"
      style={{
        borderColor: NOC.terra,
        background: "rgba(244, 63, 94, 0.10)",
        color: NOC.ink,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: NOC.terraDeep }}
            data-storage-panic-title
          >
            Storage panic — memory may not be storing
          </div>
          <p className="mt-1 text-sm" style={{ color: NOC.ink }}>
            One or more storage backends are down or offline. Fix these before trusting recalls,
            graph facts, or knowledge indexing.
          </p>
        </div>
        <Link
          href="/notebooks"
          className="shrink-0 text-xs font-semibold underline"
          style={{ color: NOC.terraDeep }}
        >
          Open Notebooks / inventory
        </Link>
      </div>
      <ul className="mt-3 space-y-2" data-storage-panic-list>
        {panics.map((alert) => (
          <StoragePanicRow key={alert.service} alert={alert} />
        ))}
      </ul>
    </aside>
  );
}

function StoragePanicRow({ alert }: { alert: StorageAlert }) {
  return (
    <li
      className="border px-3 py-2 text-sm"
      style={{ borderColor: NOC.terra, background: NOC.paper }}
      data-storage-panic-service={alert.service}
    >
      <div className="font-semibold" style={{ color: NOC.terraDeep }}>
        {alert.service}
        <span
          className="ml-2 text-[11px] font-normal uppercase"
          style={{ fontFamily: NOC_FONT_MONO, color: NOC.terra }}
        >
          {alert.status}
        </span>
      </div>
      <div className="mt-0.5 text-xs" style={{ color: NOC.muted, fontFamily: NOC_FONT_MONO }}>
        {alert.detail}
      </div>
    </li>
  );
}
