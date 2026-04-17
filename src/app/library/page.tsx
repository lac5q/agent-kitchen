"use client";

import { useKnowledge, useGitNexus } from "@/lib/api-client";
import { CollectionCard } from "@/components/library/collection-card";
import { CollectionTreemap } from "@/components/library/collection-treemap";
import { HealthPanel } from "@/components/library/health-panel";
import { GitNexusPanel } from "@/components/library/gitnexus-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function LibraryPage() {
  const { data, isLoading } = useKnowledge();
  const { data: gnData } = useGitNexus();
  const gnRepos = gnData?.repos || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const collections = data?.collections ?? [];
  const totalDocs = data?.totalDocs ?? 0;

  const top10 = collections.slice(0, 10);
  const maxCount = top10.length > 0 ? top10[0].docCount : 1;

  return (
    <TooltipProvider>
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Library</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Knowledge base collections and document health
        </p>
      </div>

      {/* Top 10 collection cards — 5 columns on lg */}
      <section>
        <h2 className="flex items-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Top Collections
          <InfoTip text="Top 10 QMD collections ranked by document count. Each card shows the collection name and doc count; the bar fill is proportional to the largest collection. Collections are folders in ~/github/knowledge/ with at least one .md file." />
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {top10.map((collection) => (
            <CollectionCard
              key={collection.name}
              collection={collection}
              maxCount={maxCount}
            />
          ))}
        </div>
      </section>

      {/* Two-column layout: Treemap left, HealthPanel right */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="flex items-center mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Collection Map
            <InfoTip text="Treemap of all QMD collections sized by document count — larger tiles mean more docs. Color groups related collections by category. Hover a tile to see the exact count. Data sourced live from the knowledge API." />
          </h2>
          <CollectionTreemap collections={collections} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Health &amp; Stats
          </h2>
          <HealthPanel collections={collections} totalDocs={totalDocs} />
        </div>
      </section>

      {/* GitNexus code graph index */}
      <div>
        <h2 className="flex items-center mb-3 text-sm font-medium text-slate-400">
          Code Graph Index <span className="text-xs text-slate-600 ml-2">via GitNexus</span>
          <InfoTip text="GitNexus symbol graph for indexed repositories. Shows symbol count, relationship count, and execution flow count per repo. Use this to navigate code, assess blast radius before edits, and trace bugs through execution flows." />
        </h2>
        <GitNexusPanel repos={gnRepos} />
      </div>
    </div>
    </TooltipProvider>
  );
}
