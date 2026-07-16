"use client";

import { useSearchParams } from "next/navigation";
import { EvalEnginePanel } from "@/components/evals/eval-engine-panel";
import { Card, PageHeader } from "@/components/shared/ui";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

export default function EvalsPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Improve"
        title="Evals"
        hint="Evaluation engine config, drift guard status, scoring weights, and run history."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="evals">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Evals page has its own config; the originating scope is shown for reference only and is NOT applied."}
          </div>
        </Card>
      )}

      <EvalEnginePanel />
    </div>
  );
}
