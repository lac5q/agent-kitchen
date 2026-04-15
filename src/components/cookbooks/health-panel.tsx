"use client";

export interface HealthPanelProps {
  totalSkills: number;
  coverageGaps: string[];
  failuresByAgent: Record<string, number>;
  failuresByErrorType: Record<string, number>;
  lastUpdated: string | null;
  staleCandidates: number;
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
}: HealthPanelProps) {
  const gapCount = coverageGaps.length;

  return (
    <div className="space-y-4">
      {/* Stat cards row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total Skills */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Skills
          </p>
          <p className="text-2xl font-bold text-amber-500">{totalSkills}</p>
        </div>

        {/* Coverage Gaps */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Coverage Gaps
          </p>
          <p className={`text-2xl font-bold ${gapCount > 0 ? "text-amber-500" : "text-slate-400"}`}>
            {gapCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">unused 30+ days</p>
        </div>

        {/* Stale Candidates */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Stale Candidates
          </p>
          <p className="text-2xl font-bold text-slate-400">{staleCandidates}</p>
        </div>
      </div>

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
  );
}
