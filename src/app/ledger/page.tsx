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

// Sample data — RTK gain output isn't granular enough yet for per-command breakdown
const SAMPLE_SAVINGS_DATA = [
  { command: "git status", tokensUsed: 120, tokensSaved: 4800 },
  { command: "git diff", tokensUsed: 340, tokensSaved: 12600 },
  { command: "git log", tokensUsed: 180, tokensSaved: 8200 },
  { command: "ls", tokensUsed: 60, tokensSaved: 2400 },
  { command: "cat", tokensUsed: 210, tokensSaved: 9100 },
];

const SAMPLE_MODEL_MIX = [
  { name: "Claude Sonnet", value: 1240 },
  { name: "Claude Haiku", value: 820 },
  { name: "Gemini", value: 310 },
  { name: "Qwen", value: 95 },
];

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Ledger</h1>
        <p className="text-sm text-slate-400 mt-1">RTK token savings and cost analytics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
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
          value={avgExecutionTime > 0 ? `${avgExecutionTime.toFixed(2)}s` : "—"}
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
          <SavingsChart data={SAMPLE_SAVINGS_DATA} />
        )}
        {activeTab === "Model Mix" && (
          <ModelMixChart data={SAMPLE_MODEL_MIX} />
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
