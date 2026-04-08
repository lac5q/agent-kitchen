"use client";

import { useState } from "react";
import { useTokenStats } from "@/lib/api-client";
import { KpiCard } from "@/components/ledger/kpi-card";
import { SavingsChart } from "@/components/ledger/savings-chart";
import { ModelMixChart } from "@/components/ledger/model-mix-chart";
import { CostCalculator } from "@/components/ledger/cost-calculator";

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const TABS = ["Savings Breakdown", "Model Mix"] as const;
type Tab = (typeof TABS)[number];

export default function LedgerPage() {
  const { data } = useTokenStats();
  const [activeTab, setActiveTab] = useState<Tab>("Savings Breakdown");

  const stats = data?.stats ?? {};
  const totalInput = (stats.totalInput as number) ?? 0;
  const totalOutput = (stats.totalOutput as number) ?? 0;
  const tokensSaved = (stats.tokensSaved as number) ?? 0;
  const savingsPercent = (stats.savingsPercent as number) ?? 0;
  const totalCommands = (stats.totalCommands as number) ?? 0;
  const avgExecutionTime = (stats.avgExecutionTime as number) ?? 0;

  const tokensProcessed = totalInput + totalOutput;

  // Real savings breakdown from RTK
  const breakdown = (stats?.commandBreakdown as Array<{
    command: string;
    count: number;
    tokensSaved: number;
    savingsPercent: number;
  }> | undefined) || [];

  const savingsData = breakdown.slice(0, 8).map((b) => ({
    command: b.command.replace("rtk ", "").slice(0, 20),
    tokensUsed: Math.round((b.tokensSaved / (b.savingsPercent / 100)) - b.tokensSaved),
    tokensSaved: b.tokensSaved,
  }));

  // Model mix — RTK doesn't expose this, show savings % split as proxy
  const modelMixData = breakdown.length > 0
    ? breakdown.slice(0, 4).map((b) => ({
        name: b.command.replace("rtk ", "").slice(0, 15),
        value: b.tokensSaved,
      }))
    : [
        { name: "Opus", value: 40 },
        { name: "Sonnet", value: 35 },
        { name: "Haiku", value: 20 },
        { name: "Other", value: 5 },
      ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Ledger</h1>
        <p className="text-sm text-slate-400 mt-1">RTK token savings and cost analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Tokens Processed"
          value={formatNum(tokensProcessed)}
          valueColor="text-sky-400"
          subtitle={`${formatNum(totalInput)} in / ${formatNum(totalOutput)} out`}
        />
        <KpiCard
          label="Tokens Saved"
          value={formatNum(tokensSaved)}
          valueColor="text-emerald-400"
          subtitle={savingsPercent > 0 ? `${savingsPercent.toFixed(1)}% savings rate` : undefined}
        />
        <KpiCard
          label="Total Commands"
          value={formatNum(totalCommands)}
          valueColor="text-amber-400"
        />
        <KpiCard
          label="Avg Execution"
          value={avgExecutionTime > 0 ? `${avgExecutionTime.toFixed(1)}s` : "N/A"}
          valueColor="text-slate-100"
        />
      </div>

      {/* Chart Tabs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        {/* Tab List */}
        <div className="flex gap-1 mb-5 w-fit rounded-lg bg-slate-800/60 p-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
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

        {/* Tab Content */}
        {activeTab === "Savings Breakdown" && (
          <SavingsChart data={savingsData} />
        )}
        {activeTab === "Model Mix" && (
          <>
            <ModelMixChart data={modelMixData} />
            <p className="mt-3 text-xs text-slate-500">
              Showing top commands by tokens saved. Per-model breakdown requires model-level logging.
            </p>
          </>
        )}
      </div>

      {/* Cost Calculator */}
      <CostCalculator
        totalInput={totalInput}
        totalOutput={totalOutput}
        tokensSaved={tokensSaved}
      />
    </div>
  );
}
