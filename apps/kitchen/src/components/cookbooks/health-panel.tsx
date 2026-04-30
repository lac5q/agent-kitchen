"use client";

import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface HealthPanelProps {
  totalSkills: number;
  coverageGaps: string[];
  failuresByAgent: Record<string, number>;
  failuresByErrorType: Record<string, number>;
  lastUpdated: string | null;
  staleCandidates: number;
  skillBudget?: {
    status: "ok" | "watch" | "over";
    budgetTokens: number;
    metadataTokens: number;
    metadataChars: number;
    utilization: number;
    uniqueSkills: number;
    averageDescriptionChars: number;
    recommendations: string[];
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString();
}

export function HealthPanel({
  totalSkills,
  coverageGaps,
  failuresByAgent,
  failuresByErrorType,
  lastUpdated,
  staleCandidates,
  skillBudget,
}: HealthPanelProps) {
  const gapCount = coverageGaps.length;
  const budgetPercent = skillBudget ? Math.round(skillBudget.utilization * 100) : 0;
  const budgetColor =
    skillBudget?.status === "over"
      ? "text-rose-400"
      : skillBudget?.status === "watch"
        ? "text-amber-500"
        : "text-emerald-400";

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* Stat cards row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Skills */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Skills
            <InfoTip text="Count of SKILL.md files discovered across all .claude/skills/ directories in agent repos. Each file represents one reusable capability an agent can load as context." />
          </p>
          <p className="text-2xl font-bold text-amber-500">{totalSkills}</p>
        </div>

        {/* Coverage Gaps */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Coverage Gaps
            <InfoTip text="Skills that have not been invoked or updated in 30+ days. These may be obsolete or under-promoted — candidates for review, promotion, or removal." />
          </p>
          <p className={`text-2xl font-bold ${gapCount > 0 ? "text-amber-500" : "text-slate-400"}`}>
            {gapCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">unused 30+ days</p>
        </div>

        {/* Stale Candidates */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Stale Candidates
            <InfoTip text="Skills flagged by the APO (Agent Performance Optimizer) as candidates for improvement or deprecation based on failure patterns and low usage signals." />
          </p>
          <p className="text-2xl font-bold text-slate-400">{staleCandidates}</p>
        </div>

        {/* Skill Context Budget */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Context Budget
            <InfoTip text="Estimated model-visible skill metadata usage after deduping skill names. Keep this under 100% to avoid startup truncation warnings." />
          </p>
          <p className={`text-2xl font-bold ${budgetColor}`}>
            {skillBudget ? `${budgetPercent}%` : "n/a"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {skillBudget
              ? `${skillBudget.uniqueSkills} unique, avg ${skillBudget.averageDescriptionChars} chars`
              : "not scanned"}
          </p>
        </div>
      </div>

      {skillBudget && skillBudget.recommendations.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-2">
            Budget Recommendations
          </h3>
          <ul className="space-y-1">
            {skillBudget.recommendations.map((recommendation) => (
              <li key={recommendation} className="text-xs text-slate-300">
                {recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Failures breakdown — two side-by-side panels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Failures by Agent */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Failures by Agent
          </h3>
          {Object.keys(failuresByAgent).length === 0 ? (
            <p className="text-xs text-slate-500">No failures recorded</p>
          ) : (
            <ul className="space-y-1">
              {Object.entries(failuresByAgent).map(([agent, count]) => (
                <li key={agent} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300 truncate">{agent}</span>
                  <span className="ml-2 text-amber-500 font-semibold tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Failures by Error Type */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Failures by Error Type
          </h3>
          {Object.keys(failuresByErrorType).length === 0 ? (
            <p className="text-xs text-slate-500">No failures recorded</p>
          ) : (
            <ul className="space-y-1">
              {Object.entries(failuresByErrorType).map(([errorType, count]) => (
                <li key={errorType} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300 truncate">{errorType}</span>
                  <span className="ml-2 text-amber-500 font-semibold tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-slate-500">
        Last synced: {formatDate(lastUpdated)}
      </p>
    </div>
    </TooltipProvider>
  );
}
