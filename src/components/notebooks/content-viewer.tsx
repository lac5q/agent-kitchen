"use client";

import type { MemoryEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const TYPE_BADGE_STYLES: Record<MemoryEntry["type"], string> = {
  user: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  feedback: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  project: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  reference: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  daily: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

interface ContentViewerProps {
  entry: MemoryEntry | null;
}

export function ContentViewer({ entry }: ContentViewerProps) {
  if (!entry) {
    return (
      <Card className="border-slate-800 bg-slate-900/50 p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500 text-sm">Select a memory to view its content.</p>
      </Card>
    );
  }

  const badgeStyle = TYPE_BADGE_STYLES[entry.type] ?? TYPE_BADGE_STYLES.daily;

  return (
    <Card className="border-slate-800 bg-slate-900/50 p-5 flex flex-col gap-0">
      {/* Header: type badge + agent badge + datetime */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={[
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            badgeStyle,
          ].join(" ")}
        >
          {entry.type}
        </span>
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
          {entry.agent}
        </span>
        <span className="text-xs text-slate-500 ml-auto">{entry.date}</span>
      </div>

      <Separator className="mb-4" />

      {/* Content */}
      <pre className="text-sm text-slate-200 whitespace-pre-wrap break-words font-mono leading-relaxed flex-1 mb-4">
        {entry.content}
      </pre>

      <Separator className="mb-3" />

      {/* Source */}
      <p className="text-xs text-slate-600 break-all">{entry.source}</p>
    </Card>
  );
}
