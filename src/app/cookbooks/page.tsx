"use client";

import { useSkills } from "@/lib/api-client";
import { HealthPanel } from "@/components/cookbooks/health-panel";
import { SkillHeatmap } from "@/components/skill-heatmap";
import { SkillsList } from "@/components/cookbooks/skills-list";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function CookbooksPage() {
  const { data, isLoading } = useSkills();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const totalSkills = data?.totalSkills ?? 0;
  const allSkills = data?.allSkills ?? [];
  const coverageGaps = data?.coverageGaps ?? [];
  const failuresByAgent = data?.failuresByAgent ?? {};
  const failuresByErrorType = data?.failuresByErrorType ?? {};
  const lastUpdated = data?.lastUpdated ?? null;
  const staleCandidates = data?.staleCandidates ?? 0;
  const contributionHistory = data?.contributionHistory ?? [];

  return (
    <TooltipProvider>
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Cookbooks</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Skill health, coverage gaps, and contribution history
        </p>
      </div>

      {/* Health panel */}
      <section>
        <h2 className="flex items-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Health Overview
          <InfoTip text="Aggregate health metrics for all agent skill files (.claude/skills/). Shows total skill count, coverage gaps (skills unused for 30+ days), stale candidates, and failure breakdowns. Sourced from the skills API on each page load." />
        </h2>
        <HealthPanel
          totalSkills={totalSkills}
          coverageGaps={coverageGaps}
          failuresByAgent={failuresByAgent}
          failuresByErrorType={failuresByErrorType}
          lastUpdated={lastUpdated}
          staleCandidates={staleCandidates}
        />
      </section>

      {/* Heatmap */}
      <section>
        <h2 className="flex items-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Contribution Heatmap
          <InfoTip text="Daily skill-file activity over the last 30 days. Each cell represents one day; darker cells mean more skill files were created or modified that day. Helps identify periods of active skill development." />
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <SkillHeatmap contributionHistory={contributionHistory} days={30} />
        </div>
      </section>

      {/* Skills list */}
      <section>
        <h2 className="flex items-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Skills
          <InfoTip text="Full list of agent skill files discovered across all .claude/skills/ directories. Each skill is a reusable instruction set an agent can load. Coverage gaps are skills with no recent usage recorded." />
        </h2>
        <SkillsList
          totalSkills={totalSkills}
          allSkills={allSkills}
          coverageGaps={coverageGaps}
        />
      </section>
    </div>
    </TooltipProvider>
  );
}
