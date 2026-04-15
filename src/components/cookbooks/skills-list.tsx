"use client";

export interface SkillsListProps {
  totalSkills: number;
  coverageGaps: string[];
}

export function SkillsList({ totalSkills, coverageGaps }: SkillsListProps) {
  const healthyCount = totalSkills - coverageGaps.length;

  return (
    <div className="space-y-4">
      {/* Count badge */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-500">
          {totalSkills} skills
        </span>
        <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400">
          {coverageGaps.length} gaps
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Coverage Gaps sub-section */}
        <div className="rounded-xl border border-amber-500/30 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Coverage Gaps
          </h3>
          {coverageGaps.length === 0 ? (
            <p className="text-xs text-slate-500">No gaps</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {coverageGaps.map((skill) => (
                <span
                  key={skill}
                  className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-xs text-amber-400"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Healthy Skills sub-section */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Healthy Skills
          </h3>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-bold text-slate-200">{healthyCount}</p>
            <p className="text-xs text-slate-500">skills with recent activity</p>
          </div>
        </div>
      </div>
    </div>
  );
}
