import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KnowledgeCollection } from "@/types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface HealthPanelProps {
  collections: KnowledgeCollection[];
  totalDocs: number;
}

export function HealthPanel({ collections, totalDocs }: HealthPanelProps) {
  const now = Date.now();

  const coverageGaps = collections.filter((c) => c.docCount < 10);

  const freshnessAlerts = collections.filter((c) => {
    if (!c.lastUpdated) return true;
    return now - new Date(c.lastUpdated).getTime() > THIRTY_DAYS_MS;
  });

  const avgSize =
    collections.length > 0
      ? Math.round(totalDocs / collections.length)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Coverage Gaps */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-400">
              Coverage Gaps
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coverageGaps.length === 0 ? (
              <p className="text-xs text-slate-500">All collections look healthy.</p>
            ) : (
              <ul className="space-y-1.5">
                {coverageGaps.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between rounded-md bg-amber-500/10 px-2.5 py-1.5"
                  >
                    <span className="text-xs text-amber-200 truncate">{c.name}</span>
                    <span className="ml-2 shrink-0 text-xs font-semibold text-amber-400">
                      {c.docCount} docs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Freshness Alerts */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-rose-400">
              Freshness Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {freshnessAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">All collections are up to date.</p>
            ) : (
              <ul className="space-y-1.5">
                {freshnessAlerts.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between rounded-md bg-rose-500/10 px-2.5 py-1.5"
                  >
                    <span className="text-xs text-rose-200 truncate">{c.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-rose-400">
                      {c.lastUpdated
                        ? `${Math.floor(
                            (now - new Date(c.lastUpdated).getTime()) /
                              (24 * 60 * 60 * 1000)
                          )}d ago`
                        : "never"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats summary */}
      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-100">{totalDocs.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Documents</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">{collections.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Collections</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-100">{avgSize.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Avg Size</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
