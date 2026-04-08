"use client";

import { useState } from "react";
import { useMemory } from "@/lib/api-client";
import type { MemoryEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { MemoryList } from "@/components/notebooks/memory-list";
import { CalendarHeatmap } from "@/components/notebooks/calendar-heatmap";
import { ContentViewer } from "@/components/notebooks/content-viewer";

type FilterTab = "All" | "Feedback" | "Project" | "User";
const TABS: FilterTab[] = ["All", "Feedback", "Project", "User"];

function StatCard({
  label,
  value,
  valueColor = "text-slate-100",
}: {
  label: string;
  value: number | string;
  valueColor?: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
    </Card>
  );
}

export default function NotebooksPage() {
  const { data, isLoading } = useMemory("claude");
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [selected, setSelected] = useState<MemoryEntry | null>(null);

  const allEntries: MemoryEntry[] = data?.claude ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const addedToday = allEntries.filter((e) => e.date?.startsWith(today)).length;
  const feedbackCount = allEntries.filter((e) => e.type === "feedback").length;
  const projectCount = allEntries.filter((e) => e.type === "project").length;

  const filtered =
    activeTab === "All"
      ? allEntries
      : allEntries.filter(
          (e) => e.type === (activeTab.toLowerCase() as MemoryEntry["type"])
        );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Notebook Wall</h1>
        <p className="text-sm text-slate-400 mt-1">
          Claude memory entries, activity heatmap, and content viewer
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Memories"
          value={allEntries.length}
          valueColor="text-sky-400"
        />
        <StatCard
          label="Added Today"
          value={addedToday}
          valueColor="text-emerald-400"
        />
        <StatCard
          label="Feedback"
          value={feedbackCount}
          valueColor="text-amber-400"
        />
        <StatCard
          label="Project"
          value={projectCount}
          valueColor="text-purple-400"
        />
      </div>

      {/* Heatmap */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <CalendarHeatmap entries={allEntries} />
      </div>

      {/* Two-column: list + viewer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: tab switcher + memory list */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 w-fit rounded-lg bg-slate-800/60 p-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSelected(null);
                  }}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "text-slate-400 hover:text-slate-200",
                  ].join(" ")}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <MemoryList
            entries={filtered}
            onSelect={setSelected}
            selected={selected}
          />
        </div>

        {/* Right: content viewer */}
        <div>
          <ContentViewer entry={selected} />
        </div>
      </div>
    </div>
  );
}
