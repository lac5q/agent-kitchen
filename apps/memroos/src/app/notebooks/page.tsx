"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useMemoryInventory,
  useMultiMemorySearch,
  type MemoryInventoryCategoryId,
  type MemoryInventoryRow,
} from "@/lib/api-client";
import { MemoryList } from "@/components/notebooks/memory-list";
import { CalendarHeatmap } from "@/components/notebooks/calendar-heatmap";
import { ContentViewer } from "@/components/notebooks/content-viewer";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, PageHeader, Stat } from "@/components/shared/ui";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
const CATEGORY_ORDER: Array<MemoryInventoryCategoryId | "all"> = [
  "all",
  "vector_memory",
  "ingested_message",
  "consolidated_insight",
  "episodic_write",
  "graph_fact",
  "knowledge_file",
];

const TIER_STYLES = {
  vector: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700",
  graph: "border-violet-500/30 bg-violet-500/10 text-violet-700",
  episodic: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
};

function StatCard({
  label,
  value,
  tone = "neutral",
  tooltip,
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "terra" | "success" | "warn" | "info";
  tooltip?: string;
}) {
  return (
    <Card>
      <Stat
        label={<>{label}{tooltip && <InfoTip text={tooltip} />}</>}
        value={value}
        tone={tone}
      />
    </Card>
  );
}


export default function NotebooksPage() {
  const searchParams = useSearchParams();
  const urlSearchQuery = searchParams.get("q")?.trim() ?? "";
  const fromWindow = searchParams.get("from_window") ?? null;
  const fromWorkspace = searchParams.get("from_workspace") ?? null;
  const fromScopeNote = searchParams.get("from_scope_note") ?? null;  const [categoryFilter, setCategoryFilter] = useState<MemoryInventoryCategoryId | "all">("all");
  const [selected, setSelected] = useState<MemoryInventoryRow | null>(null);
  const [searchInput, setSearchInput] = useState(urlSearchQuery);
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const searchQuery = submittedSearchQuery || urlSearchQuery;
  const search = useMultiMemorySearch(searchQuery, 8);
  const inventory = useMemoryInventory({ category: categoryFilter });

  const categories = inventory.data?.categories ?? [];
  const rows = inventory.data?.rows ?? [];
  const newestRowDate = rows[0]?.timestamp?.slice(0, 10) ?? "none";
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  if (inventory.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6">

      <PageHeader
        eyebrow="Memory"
        title={<>Memory Inventory <InfoTip text="Counts are split by source-backed category: vector memories, ingested messages, consolidated insights, episodic writes, graph facts, and knowledge files." /></>}
        hint="Source-backed category counts, provenance rows, multi-tier search, and degraded-state inspection."
      />
      {fromWindow && (
        <Card pad="sm" data-drilldown-from="memory">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Memory has its own category + search filters; the originating scope is shown for reference and is NOT applied to the inventory below."}
          </div>
        </Card>
      )}      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Newest inventory row: <span className="font-semibold">{newestRowDate}</span>. Counts cite their owning store, and degraded categories explain missing backend counts.
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {categories.map((category) => (
          <StatCard
            key={category.id}
            label={category.label}
            value={category.count ?? "unknown"}
            tone={category.status === "degraded" ? "warn" : category.status === "empty" ? "neutral" : "info"}
            tooltip={`${category.description} Source: ${category.sourceOfTruth}${category.lastUpdated ? `. Last updated: ${category.lastUpdated}` : ""}${category.warnings.length ? `. ${category.warnings.join("; ")}` : ""}`}
          />
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center text-base font-semibold text-slate-950">
              Multi-Memory Search
              <InfoTip text="Searches semantic/vector memory, graph memory, and local episodic memory together. Each result shows the tier that produced it so you can see what agents can retrieve." />
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Find retained context across vector, graph, and episodic memory before handing work to an agent.
            </p>
          </div>
          {search.data?.tiers && (
            <div className="flex flex-wrap gap-2">
              {search.data.tiers.map((tier) => (
                <span
                  key={tier.tier}
                  className={[
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    tier.ok ? TIER_STYLES[tier.tier] : "border-rose-200 bg-rose-50 text-rose-700",
                  ].join(" ")}
                  title={tier.error}
                >
                  {tier.tier} {tier.ok ? tier.count : "offline"}
                </span>
              ))}
            </div>
          )}
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedSearchQuery(searchInput.trim());
          }}
        >
          <input
            aria-label="Search all memory tiers"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search product decisions, sales objections, incidents..."
            className="min-h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
          <button
            type="submit"
            disabled={!searchInput.trim() || search.isFetching}
            className="min-h-10 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-300"
            style={{
              background: searchInput.trim() && !search.isFetching ? NOC.info : NOC.ruleStrong,
              color: NOC.cream,
            }}
          >
            {search.isFetching ? "Searching..." : "Search Memory"}
          </button>
        </form>

        {searchQuery && (
          <div className="mt-4">
            {search.isError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Memory search failed. Check `/api/memory/multi-search` and the memory tier health details.
              </div>
            ) : search.data && search.data.results.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-stone-500">
                No retained context found for <span className="font-medium text-slate-700">{searchQuery}</span>.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {search.data?.results.map((result) => (
                  <article key={`${result.tier}-${result.id}`} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={["rounded-full border px-2 py-0.5 text-xs font-semibold", TIER_STYLES[result.tier]].join(" ")}>
                        {result.tier}
                      </span>
                      {typeof result.score === "number" && (
                        <span className="text-xs text-stone-500">{result.score.toFixed(2)}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-950">{result.title}</h3>
                    <p className="mt-1 line-clamp-4 text-sm leading-6 text-stone-600">{result.content}</p>
                    {result.source && <p className="mt-2 text-xs text-stone-500">{result.source}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)]">
        <CalendarHeatmap entries={rows} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {CATEGORY_ORDER.map((categoryId) => {
              const isActive = categoryFilter === categoryId;
              const label = categoryId === "all" ? "All categories" : categoryById.get(categoryId)?.label ?? categoryId;
              return (
                <button
                  key={categoryId}
                  onClick={() => {
                    setCategoryFilter(categoryId);
                    setSelected(null);
                  }}
                  className={[
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "border border-amber-300 bg-amber-50 text-amber-700"
                      : "text-stone-500 hover:bg-white hover:text-slate-800",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <MemoryList
            entries={rows}
            onSelect={setSelected}
            selected={selected}
          />
        </div>

        <div>
          <ContentViewer entry={selected} />
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
