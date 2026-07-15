"use client";

import { useState } from "react";
import { AdapterStatusPanel } from "@/components/business-ops/adapter-status-panel";
import { KpiTimelinePanel } from "@/components/business-ops/kpi-timeline-panel";
import { useAgents, useEvalConfig } from "@/lib/api-client";
import { resolveFinanceTerminology } from "@/lib/finance-reconciliation/terminology";
import { Card, PageHeader } from "@/components/shared/ui";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

const DATE_RANGES = [
  { label: "Last 24 hours", value: "1", days: 1 },
  { label: "Last 7 days", value: "7", days: 7 },
  { label: "Last 30 days", value: "30", days: 30 },
  { label: "Last 90 days", value: "90", days: 90 },
] as const;

export default function BusinessOpsPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [rangeDays, setRangeDays] = useState<(typeof DATE_RANGES)[number]["value"]>("30");
  const [rangeAnchorIso] = useState(() => new Date().toISOString());
  const { data: agentsData } = useAgents();
  const { data: evalConfigData } = useEvalConfig();
  const agents = agentsData?.agents ?? [];
  const terms = evalConfigData?.config
    ? resolveFinanceTerminology(evalConfigData.config)
    : { enabled: false, trace: "trace", eval: "eval", proposal: "proposal" };
  const title = terms.enabled ? "Finance Reconciliation" : "Business Ops";
  const selectedRange = DATE_RANGES.find((range) => range.value === rangeDays) ?? DATE_RANGES[2];
  const since = new Date(new Date(rangeAnchorIso).getTime() - selectedRange.days * 24 * 60 * 60 * 1000).toISOString();
  const dateRange = { since };
  const scopeLabel = `since=${since.slice(0, 10)}, agentId=${selectedAgentId ?? "all"}`;

  return (
    <div className="space-y-6" data-business-ops-scope={scopeLabel}>
      <PageHeader
        eyebrow="Operations"
        title={title}
        hint={
          terms.enabled
            ? `Post-hoc ${terms.trace} signals: per-agent reconciliation timeline with exceptions and adapter poll status.`
            : "Post-hoc business outcome signals: per-agent W timeline with L1/L2/L3 breakdown and adapter poll status."
        }
      />

      <Card className="flex flex-wrap items-center gap-3" pad="sm" data-business-ops-filter-card>
        <label className="text-sm font-semibold" style={{ color: NOC.ink }} htmlFor="agent-select">
          Agent
        </label>
        <select
          id="agent-select"
          className="px-2 py-1.5 text-sm focus:outline-none"
          style={{ background: NOC.paper, border: `1px solid ${NOC.ruleStrong}`, color: NOC.ink }}
          value={selectedAgentId ?? ""}
          onChange={(e) => setSelectedAgentId(e.target.value || undefined)}
          data-business-ops-agent-select
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id} data-business-ops-agent-option={agent.id}>
              {agent.name ?? agent.id}
            </option>
          ))}
        </select>
        <label className="text-sm font-semibold" style={{ color: NOC.ink }} htmlFor="date-range-select">
          Date range
        </label>
        <select
          id="date-range-select"
          className="px-2 py-1.5 text-sm focus:outline-none"
          style={{ background: NOC.paper, border: `1px solid ${NOC.ruleStrong}`, color: NOC.ink }}
          value={rangeDays}
          onChange={(e) => setRangeDays(e.target.value as typeof rangeDays)}
          data-business-ops-date-select
        >
          {DATE_RANGES.map((range) => (
            <option key={range.value} value={range.value} data-business-ops-date-option={range.value}>
              {range.label}
            </option>
          ))}
        </select>
        <span
          className="text-xs"
          style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
          data-business-ops-filter-scope
        >
          scope: {scopeLabel} · W timeline and adapter status use this window.
        </span>
      </Card>

      <KpiTimelinePanel agentId={selectedAgentId} dateRange={dateRange} />

      <AdapterStatusPanel agentId={selectedAgentId} dateRange={dateRange} />
    </div>
  );
}
