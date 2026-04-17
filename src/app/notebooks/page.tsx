"use client";

import { useState } from "react";
import { useMemory } from "@/lib/api-client";
import type { MemoryEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { MemoryList } from "@/components/notebooks/memory-list";
import { CalendarHeatmap } from "@/components/notebooks/calendar-heatmap";
import { ContentViewer } from "@/components/notebooks/content-viewer";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";

type FilterTab = "All" | "Feedback" | "Project" | "User";
const TABS: FilterTab[] = ["All", "Feedback", "Project", "User"];

function StatCard({
  label,
  value,
  valueColor = "text-slate-100",
  tooltip,
}: {
  label: string;
  value: number | string;
  valueColor?: string;
  tooltip?: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 p-4">
      <p className="flex items-center text-xs text-slate-500">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </p>
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
    <TooltipProvider>
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="flex items-center text-2xl font-bold text-amber-500">
          The Notebook Wall
          <InfoTip text="Claude's persistent memory store. Entries are written by Claude Code agents using the mem0 memory skill and stored as structured JSONL files. Browse, filter, and inspect individual memory entries here." />
        </h1>
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
          tooltip="Total number of memory entries stored for this Claude instance. Each entry is a structured fact, preference, or correction that Claude has learned across sessions."
        />
        <StatCard
          label="Added Today"
          value={addedToday}
          valueColor="text-emerald-400"
          tooltip="Memory entries whose date field matches today's date. A high count means Claude is actively learning from this session; zero means no new memories have been written today."
        />
        <StatCard
          label="Feedback"
          value={feedbackCount}
          valueColor="text-amber-400"
          tooltip="Entries of type 'feedback' — corrections or adjustments Luis has made to Claude's behavior. These are the most important entries as they shape how Claude responds in future sessions."
        />
        <StatCard
          label="Project"
          value={projectCount}
          valueColor="text-purple-400"
          tooltip="Entries of type 'project' — context facts about specific repositories, codebases, or ongoing work. Help Claude recall architectural decisions and project-specific conventions."
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
    </TooltipProvider>
  );
}
