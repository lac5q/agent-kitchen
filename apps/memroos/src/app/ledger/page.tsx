
"use client";


import { useState } from "react";import { useSearchParams } from "next/navigation";
import { useTokenStats, useModelUsage } from "@/lib/api-client";
import { SavingsChart } from "@/components/ledger/savings-chart";
import { ModelMixChart } from "@/components/ledger/model-mix-chart";
import { CostCalculator } from "@/components/ledger/cost-calculator";
import { LedgerAnalyticsPanel } from "@/components/ledger/analytics-panel";
import { ModelRoutingPanel } from "@/components/ledger/model-routing-panel";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, PageHeader, Stat } from "@/components/shared/ui";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const TABS = ["Savings Breakdown", "Model Mix"] as const;
type Tab = (typeof TABS)[number];
const LEDGER_RANGES = [
  { label: "Last 24 hours", value: "1", days: 1 },
  { label: "Last 7 days", value: "7", days: 7 },
  { label: "Last 30 days", value: "30", days: 30 },
] as const;


export default function LedgerPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  const [rangeDays, setRangeDays] = useState<(typeof LEDGER_RANGES)[number]["value"]>("7");
  const [rangeAnchorIso] = useState(() => new Date().toISOString());
  const selectedRange = LEDGER_RANGES.find((range) => range.value === rangeDays) ?? LEDGER_RANGES[1];  const since = new Date(new Date(rangeAnchorIso).getTime() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, isLoading: tokenLoading, error: tokenError } = useTokenStats();
  const { data: modelData, isLoading: modelLoading, error: modelError } = useModelUsage(since);
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
    tokensUsed: b.savingsPercent > 0
      ? Math.max(0, Math.round((b.tokensSaved / (b.savingsPercent / 100)) - b.tokensSaved))
      : 0,
    tokensSaved: b.tokensSaved,
  }));

  // Real model mix from Claude Code JSONL session logs
  const modelMixData = (modelData?.usage.models ?? []).map((m) => ({
    name: m.name,
    value: m.totalTokens,
  }));

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6">

      <PageHeader
        eyebrow="Operations"
        title="Ledger"
        hint="Token savings, model mix, routing quality, and cost analytics across retained work."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="ledger">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Ledger has its own date-range selector; the originating scope is shown for reference and is NOT applied to the data below."}
          </div>
        </Card>
      )}
      <Card className="flex flex-wrap items-center gap-3" pad="sm">
        <label className="text-sm font-semibold" style={{ color: NOC.ink }} htmlFor="ledger-date-range">
          Date range
        </label>
        <select
          id="ledger-date-range"
          className="px-2 py-1.5 text-sm focus:outline-none"
          style={{ background: NOC.paper, border: `1px solid ${NOC.ruleStrong}`, color: NOC.ink }}
          value={rangeDays}
          onChange={(event) => setRangeDays(event.target.value as typeof rangeDays)}
        >
          {LEDGER_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: NOC.soft }}>
          Model mix and trend panels use this window where the source supports it. RTK token savings are cumulative until RTK exposes ranged stats.
        </span>
      </Card>

      {(tokenLoading || modelLoading || tokenError || modelError) && (
        <Card pad="sm">
          <div className="text-sm font-semibold" style={{ color: NOC.ink }}>Ledger source status</div>
          <div className="mt-1 text-xs" style={{ color: tokenError || modelError ? NOC.terra : NOC.soft }}>
            {tokenLoading || modelLoading ? "Loading RTK token stats and Claude model usage..." : null}
            {tokenError ? `RTK token stats failed: ${tokenError instanceof Error ? tokenError.message : "unknown error"}. ` : null}
            {modelError ? `Model usage failed: ${modelError instanceof Error ? modelError.message : "unknown error"}.` : null}
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <Stat
            label={<>Tokens Processed <InfoTip text="Total tokens sent to and received from AI models — input (prompts) plus output (responses). Sourced from RTK's SQLite session log. Tracks cumulative usage across all Claude Code sessions." /></>}
            value={formatNum(tokensProcessed)}
            tone="info"
            sub={`${formatNum(totalInput)} in / ${formatNum(totalOutput)} out`}
          />
        </Card>
        <Card>
          <Stat
            label={<>Tokens Saved <InfoTip text="Tokens that would have been sent without RTK's output filtering. RTK compresses verbose CLI output (git, npm, etc.) before it reaches Claude, reducing token usage by 60-90% on dev operations." /></>}
            value={formatNum(tokensSaved)}
            tone="success"
            sub={savingsPercent > 0 ? `${savingsPercent.toFixed(1)}% savings rate` : undefined}
          />
        </Card>
        <Card>
          <Stat
            label={<>Total Commands <InfoTip text="Number of CLI commands executed through the RTK proxy. Each command is a hook intercept where RTK filtered the output before it was passed to Claude as context." /></>}
            value={formatNum(totalCommands)}
            tone="terra"
          />
        </Card>
        <Card>
          <Stat
            label={<>Avg Execution <InfoTip text="Average wall-clock time per RTK-proxied command, in seconds. Measured from command start to output delivery. High values may indicate slow disk I/O or large repository operations." /></>}
            value={avgExecutionTime > 0 ? `${avgExecutionTime.toFixed(1)}s` : "N/A"}
          />
        </Card>
      </div>

      {/* Chart Tabs */}
      <Card>
        {/* Tab List */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex gap-1 w-fit p-1" style={{ background: NOC.fog, border: `1px solid ${NOC.rule}` }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "px-4 py-1.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "border"
                      : "",
                  ].join(" ")}
                  style={{
                    background: isActive ? NOC.peach : "transparent",
                    borderColor: isActive ? NOC.terra : "transparent",
                    color: isActive ? NOC.terraDeep : NOC.muted,
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          {activeTab === "Savings Breakdown" && (
            <InfoTip text="Per-command breakdown of token savings. Shows which CLI commands (git, npm, etc.) saved the most tokens via RTK's output filtering. Top 8 commands by savings volume." />
          )}
          {activeTab === "Model Mix" && (
            <InfoTip text="Distribution of token usage across Claude model tiers (Haiku, Sonnet, Opus). Sourced from ~/.claude/projects JSONL session logs. Helps identify which tasks are consuming expensive model capacity." />
          )}
        </div>

        {/* Tab Content */}
        {activeTab === "Savings Breakdown" && (
          <SavingsChart data={savingsData} />
        )}
        {activeTab === "Model Mix" && (
          <>
            <ModelMixChart data={modelMixData} />
            <p className="mt-3 text-xs" style={{ color: NOC.soft }}>
              Aggregated from Claude Code session logs (~/.claude/projects). Total tokens = input + output.
            </p>
          </>
        )}
      </Card>

      {/* Cost Calculator */}
      <CostCalculator
        totalInput={totalInput}
        totalOutput={totalOutput}
        tokensSaved={tokensSaved}
      />

      <ModelRoutingPanel />

      {/* Usage Trends */}
      <LedgerAnalyticsPanel />

    </div>
    </TooltipProvider>
  );
}
