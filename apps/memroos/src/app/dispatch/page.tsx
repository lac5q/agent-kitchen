
"use client";

import { useSearchParams } from "next/navigation";
import { AgentEngagementConsole } from "@/components/engagement/agent-engagement-console";
import { OrchestrationHilPanel } from "@/components/orchestration/orchestration-hil-panel";
import { Card, PageHeader } from "@/components/shared/ui";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
export default function DispatchPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engage"
        title="Dispatch"
        hint="Task-first agent engagement with inspectable context, standups, chat, and delivery checks."
      />
      {fromWindow && (
        <Card pad="sm" data-drilldown-from="dispatch">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Dispatch has its own filters; the originating scope is shown for reference only."}
          </div>
        </Card>
      )}
      <AgentEngagementConsole />
      <OrchestrationHilPanel />
    </div>
  );
}