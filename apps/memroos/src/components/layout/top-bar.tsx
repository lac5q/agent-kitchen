"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KangarooMark } from "./brand-mark";
import { NOC } from "@/lib/noc-theme";
import { hasStoragePanic, storagePanicAlerts } from "@/lib/storage-health";
import type { HealthStatus } from "@/types";

interface TopBarProps {
  services: HealthStatus[];
  onMenuClick?: () => void;
}

function formatClock() {
  return new Date().toLocaleString("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function useClock() {
  const [now, setNow] = useState<string>(() => formatClock());
  useEffect(() => {
    const id = window.setInterval(() => setNow(formatClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function TopBar({ services, onMenuClick }: TopBarProps) {
  const clock = useClock();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const storagePanic = hasStoragePanic(services);
  const panicServices = storagePanicAlerts(services);
  const degraded = services.filter((s) => s.status !== "up").length;
  const healthy = degraded === 0;

  function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/notebooks?q=${encodeURIComponent(trimmed)}`);
  }

  const healthLabel = storagePanic
    ? `STORAGE PANIC · ${panicServices.map((s) => s.service).join(", ")}`
    : healthy
      ? "All services healthy"
      : `${degraded} service${degraded > 1 ? "s" : ""} degraded`;

  const healthColor = storagePanic ? NOC.terra : healthy ? NOC.success : NOC.warn;

  return (
    <header
      className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3.5 border-b px-4 backdrop-blur-md lg:left-[232px] lg:px-6"
      style={{
        borderColor: NOC.rule,
        background: `color-mix(in srgb, ${NOC.cream} 92%, transparent)`,
        color: NOC.ink,
      }}
    >
      {/* Hamburger — mobile only */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors lg:hidden"
          style={{ color: NOC.muted }}
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
      <KangarooMark className="h-8 w-8 shrink-0 lg:hidden" />

      {/* Global search */}
      <form
        onSubmit={submitSearch}
        className="flex min-w-0 flex-1 items-center gap-2 border px-3 py-1.5 sm:max-w-[460px]"
        style={{ borderColor: NOC.rule, background: NOC.paper, color: NOC.soft }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input
          aria-label="Search memory, knowledge, agents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
              event.currentTarget.focus();
            }
          }}
          placeholder="Search memory, knowledge, agents..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-stone-500"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="ml-auto hidden border px-1.5 font-mono text-[11px] transition disabled:opacity-50 sm:inline"
          style={{ borderColor: NOC.rule }}
          aria-label="Submit global search"
        >
          ⌘ K
        </button>
      </form>

      {/* Right cluster: health · clock · avatar */}
      <div className="flex shrink-0 items-center gap-2.5 text-[12px]" style={{ color: NOC.muted }}>
        <span
          className="hidden items-center gap-1.5 sm:flex"
          data-topbar-health
          data-storage-panic={storagePanic ? "true" : "false"}
          title={panicServices.map((s) => `${s.service}: ${s.detail}`).join("\n") || undefined}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: healthColor }}
          />
          <span style={{ color: storagePanic ? NOC.terraDeep : undefined, fontWeight: storagePanic ? 700 : undefined }}>
            {healthLabel}
          </span>
        </span>
        <span className="hidden h-4 w-px sm:block" style={{ background: NOC.rule }} />
        <span className="hidden font-mono sm:inline" data-topbar-clock="true">{clock}</span>
        <span className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: NOC.peach, color: NOC.terraDeep }}>
          LC
        </span>
      </div>
    </header>
  );
}
