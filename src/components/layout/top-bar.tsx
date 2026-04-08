"use client";

import { HealthDot } from "./health-dot";
import type { HealthStatus } from "@/types";

interface TopBarProps {
  services: HealthStatus[];
}

export function TopBar({ services }: TopBarProps) {
  return (
    <header className="fixed left-64 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 backdrop-blur-sm">
      <h2 className="text-sm font-medium text-slate-300">System Health</h2>
      <div className="flex items-center gap-4">
        {services.map((svc) => (
          <HealthDot
            key={svc.service}
            service={svc.service}
            status={svc.status}
            latencyMs={svc.latencyMs}
          />
        ))}
      </div>
    </header>
  );
}
