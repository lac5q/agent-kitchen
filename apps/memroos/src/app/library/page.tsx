"use client";

import { useSearchParams } from "next/navigation";
import { useKnowledge, useGitNexus } from "@/lib/api-client";
import { CollectionCard } from "@/components/library/collection-card";
import { CollectionTreemap } from "@/components/library/collection-treemap";
import { HealthPanel } from "@/components/library/health-panel";
import { GitNexusPanel } from "@/components/library/gitnexus-panel";
import { SqliteHealthPanel } from "@/components/ledger/sqlite-health-panel";
import { MemoryIntelligencePanel } from "@/components/ledger/memory-intelligence-panel";
import { SecurityOperationsPanel } from "@/components/security/security-operations-panel";
import { CacheHealthPanel } from "@/components/performance/cache-health-panel";
import { LibraryAnalyticsPanel } from "@/components/library/analytics-panel";
import { CollectionTrendsPanel } from "@/components/library/collection-trends-panel";
import { ContextSourcesPanel } from "@/components/library/context-sources-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, PageHeader } from "@/components/shared/ui";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

export default function LibraryPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
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
  const totalFiles = data?.totalFiles ?? data?.totalDocs ?? 0;

  const top10 = collections.slice(0, 10);
  const maxCount = top10.length > 0 ? top10[0].docCount : 1;

  return (
    <TooltipProvider>
    <div className="space-y-8">
      <PageHeader
        eyebrow="Memory"
        title="Knowledge"
        hint="Source corpus, collection health, code graph, and memory infrastructure."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="library">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Library has its own sources/index selectors; the originating scope is shown for reference only and is NOT applied."}
          </div>
        </Card>
      )}

      {/* Top 10 collection cards — 5 columns on lg */}
      <section>
        <h2 className="mb-3 flex items-center text-sm font-semibold uppercase tracking-wider" style={{ color: NOC.soft }}>
          Top Collections
          <InfoTip text="Top 10 QMD collections ranked by live file count. Each card shows the collection name and file count; the bar fill is proportional to the largest collection. Collections are configured folders in ~/github/knowledge/ containing .md, .mdx, or .txt files." />
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
        <Card>
          <h2 className="mb-3 flex items-center text-sm font-semibold uppercase tracking-wider" style={{ color: NOC.soft }}>
            Collection Map
            <InfoTip text="Treemap of all QMD collections sized by live file count — larger tiles mean more files. Color groups related collections by category. Hover a tile to see the exact count. Data sourced live from the knowledge API." />
          </h2>
          <CollectionTreemap collections={collections} />
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: NOC.soft }}>
            Health &amp; Stats
          </h2>
          <HealthPanel collections={collections} totalFiles={totalFiles} />
        </div>
      </section>

      {/* GitNexus code graph index */}
      <section>
        <h2 className="mb-3 flex items-center text-sm font-semibold uppercase tracking-wider" style={{ color: NOC.soft }}>
          Code Graph Index <span className="ml-2 text-xs normal-case" style={{ color: NOC.cold }}>via GitNexus</span>
          <InfoTip text="GitNexus symbol graph for indexed repositories. Shows symbol count, relationship count, and execution flow count per repo. Use this to navigate code, assess blast radius before edits, and trace bugs through execution flows." />
        </h2>
        <GitNexusPanel repos={gnRepos} />
      </section>

      {/* Conversation Memory */}
      <section id="governance" className="scroll-mt-20 flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: NOC.soft }}>
          Memory Governance
        </h2>
        <Card>
          <SqliteHealthPanel />
        </Card>
        <Card>
          <MemoryIntelligencePanel />
        </Card>
        <Card>
          <ContextSourcesPanel />
        </Card>
        <Card>
          <SecurityOperationsPanel />
        </Card>
        <Card>
          <CacheHealthPanel />
        </Card>
      </section>

      {/* Usage Trends */}
      <section className="space-y-6">
        <CollectionTrendsPanel />
        <LibraryAnalyticsPanel />
      </section>
    </div>
    </TooltipProvider>
  );
}
