"use client";

import { HealthDot } from "./health-dot";
import type { HealthStatus } from "@/types";

interface TopBarProps {
  services: HealthStatus[];
  onMenuClick?: () => void;
}

export function TopBar({ services, onMenuClick }: TopBarProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 backdrop-blur-sm lg:left-64 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="16" height="2" rx="1" />
              <rect x="2" y="9" width="16" height="2" rx="1" />
              <rect x="2" y="14" width="16" height="2" rx="1" />
            </svg>
          </button>
        )}
        <h2 className="text-sm font-medium text-slate-300">System Health</h2>
      </div>
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
