"use client";

export interface SkillsListProps {
  totalSkills: number;
  allSkills: string[];
  coverageGaps: string[];
}

export function SkillsList({ totalSkills, allSkills, coverageGaps }: SkillsListProps) {
  const gapSet = new Set(coverageGaps);
  const gapCount = coverageGaps.length;

  return (
    <div className="space-y-4">
      {/* Count badge */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-500">
          {totalSkills} skills
        </span>
        <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400">
          {gapCount} gaps
        </span>
      </div>

      {/* All skills as badges — gaps highlighted amber, healthy neutral */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {allSkills.length === 0 ? (
          <p className="text-xs text-slate-500">No skills found</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allSkills.map((skill) =>
              gapSet.has(skill) ? (
                <span
                  key={skill}
                  className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-xs text-amber-400"
                >
                  {skill}
                </span>
              ) : (
                <span
                  key={skill}
                  className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300"
                >
                  {skill}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
