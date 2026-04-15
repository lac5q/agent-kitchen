"use client";

import { useSkills } from "@/lib/api-client";
import { HealthPanel } from "@/components/cookbooks/health-panel";
import { SkillHeatmap } from "@/components/skill-heatmap";
import { SkillsList } from "@/components/cookbooks/skills-list";

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
  const coverageGaps = data?.coverageGaps ?? [];
  const failuresByAgent = data?.failuresByAgent ?? {};
  const failuresByErrorType = data?.failuresByErrorType ?? {};
  const lastUpdated = data?.lastUpdated ?? null;
  const staleCandidates = data?.staleCandidates ?? 0;
  const contributionHistory = data?.contributionHistory ?? [];

  return (
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
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Health Overview
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
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Contribution Heatmap
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <SkillHeatmap contributionHistory={contributionHistory} days={30} />
        </div>
      </section>

      {/* Skills list */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Skills
        </h2>
        <SkillsList
          totalSkills={totalSkills}
          coverageGaps={coverageGaps}
        />
      </section>
    </div>
  );
}
