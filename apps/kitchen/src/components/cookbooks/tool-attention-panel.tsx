"use client";

import { useState } from "react";
import { Search, Server, Boxes, Target, History } from "lucide-react";
import { useToolAttention } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import type { ToolAttentionCapability } from "@/types";

function statusClass(status: string) {
  if (status === "available") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "candidate") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function StatCard({ icon: Icon, label, value }: {
  icon: typeof Server;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Icon className="h-4 w-4 text-amber-500" />
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

function CapabilityRow({ capability }: { capability: ToolAttentionCapability }) {
  return (
    <div className="grid gap-3 border-b border-slate-800 py-3 last:border-0 md:grid-cols-[1fr_120px_120px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-200">{capability.name}</p>
          {capability.topLevel && (
            <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
              top-level
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{capability.description}</p>
      </div>
      <div className="flex items-start md:justify-end">
        <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">
          {capability.type}
        </span>
      </div>
      <div className="flex items-start md:justify-end">
        <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(capability.status)}`}>
          {capability.status}
        </span>
      </div>
    </div>
  );
}

export function ToolAttentionPanel() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useToolAttention(query);

  const capabilities = data?.capabilities ?? [];
  const recommendations = data?.recommendations ?? [];
  const healthMessages = data?.health.messages ?? [];
  const topCapabilities = capabilities.slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Boxes} label="Capabilities" value={data?.summary.totalCapabilities ?? 0} />
        <StatCard icon={Server} label="Top-Level Tools" value={data?.summary.topLevelTools ?? 0} />
        <StatCard icon={Target} label="Workspaces" value={data?.summary.workspaces ?? 0} />
        <StatCard icon={History} label="Outcomes" value={data?.summary.recentOutcomes ?? 0} />
      </div>

      {healthMessages.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-300">Tool Attention Health</p>
          <ul className="mt-2 space-y-1">
            {healthMessages.map((message) => (
              <li key={message} className="text-xs text-slate-300">{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Capability Catalog</h3>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools"
                className="pl-9"
                aria-label="Search tool capabilities"
              />
            </div>
          </div>
          {isLoading ? (
            <p className="py-8 text-center text-xs text-slate-500">Loading capabilities...</p>
          ) : topCapabilities.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No matching capabilities</p>
          ) : (
            <div>
              {topCapabilities.map((capability) => (
                <CapabilityRow key={capability.id} capability={capability} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Recommended Loads</h3>
          {recommendations.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No recommendations available</p>
          ) : (
            <div className="mt-3 space-y-3">
              {recommendations.map((item) => (
                <div key={item.capabilityId} className="rounded-lg bg-slate-950/60 p-3">
                  <p className="text-sm font-semibold text-amber-400">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
