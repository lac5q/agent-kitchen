"use client";

import type { MemoryInventoryRow } from "@/lib/api-client";

const CATEGORY_BADGE_STYLES: Record<MemoryInventoryRow["category"], string> = {
  vector_memory: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  ingested_message: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  consolidated_insight: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  episodic_write: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  graph_fact: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  knowledge_file: "bg-slate-100 text-stone-600 border-slate-200",
};

interface MemoryListProps {
  entries: MemoryInventoryRow[];
  onSelect: (entry: MemoryInventoryRow) => void;
  selected: MemoryInventoryRow | null;
}

export function MemoryList({ entries, onSelect, selected }: MemoryListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-stone-500">
        No memory inventory rows found for the selected filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
      {entries.map((entry) => {
        const isSelected = selected?.id === entry.id;
        const truncated =
          entry.content.length > 80
            ? entry.content.slice(0, 80) + "…"
            : entry.content;
        const badgeStyle = CATEGORY_BADGE_STYLES[entry.category] ?? CATEGORY_BADGE_STYLES.knowledge_file;

        return (
          <button
            key={entry.id}
            onClick={() => onSelect(entry)}
            className={[
              "w-full text-left rounded-lg border p-3 transition-colors",
              isSelected
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
            data-row-id={entry.id}
            data-category={entry.category}
            data-backend={entry.backend}
            data-source={entry.source}
            data-timestamp={entry.timestamp ?? null}
            data-consolidation-state={entry.consolidationState}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={[
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                  badgeStyle,
                ].join(" ")}
              >
                {entry.label}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-stone-600">
                {entry.backend}
              </span>
              <span className="ml-auto text-xs text-stone-500">{entry.timestamp?.slice(0, 10) ?? "no timestamp"}</span>
            </div>
            <p className="text-sm leading-snug text-slate-700">{truncated}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
              <span>{entry.source}</span>
              <span>{entry.consolidationState}</span>
              {entry.evidencePointer && <span className="break-all">{entry.evidencePointer}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
