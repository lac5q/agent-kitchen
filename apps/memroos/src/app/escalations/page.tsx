"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEscalations, useResolveEscalation } from "@/lib/api-client";
import type { EscalationWithCountdown } from "@/lib/api-client";
import { SlaCountdown } from "@/components/escalations/sla-countdown";
import { Btn, Card, PageHeader, Pill } from "@/components/shared/ui";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

type TabStatus = "open" | "resolved" | "sla_breached" | "all";

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function EscalationCard({
  escalation,
  onResolve,
  canResolve,
}: {
  escalation: EscalationWithCountdown;
  onResolve: (id: string, note?: string) => void;
  canResolve: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState("");
  const isOverdue = escalation.slaRemainingMs <= 0;
  const isResolved = escalation.status === "resolved";

  return (
    <Card
      className="space-y-2"
      style={isOverdue && !isResolved ? { background: NOC.warnBg, borderColor: NOC.warn } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill>{escalation.entity_type}</Pill>
            <Pill tone="info">{escalation.escalation_type}</Pill>
            {isOverdue && !isResolved && (
              <Pill tone="warn">SLA breached</Pill>
            )}
            <Pill tone={escalation.status === "resolved" ? "success" : escalation.status === "sla_breached" ? "warn" : "terra"}>
              {escalation.status}
            </Pill>
          </div>
          <p className="text-xs font-mono truncate" style={{ color: NOC.muted }} title={escalation.entity_id}>
            {escalation.entity_id}
          </p>
        </div>

        <div className="text-right shrink-0">
          {!isResolved && (
            <SlaCountdown
              deadline={escalation.sla_deadline}
              slaSeconds={escalation.sla_seconds}
              status={escalation.status}
            />
          )}
          <div className="text-xs mt-0.5" style={{ color: NOC.soft }}>
            {isResolved ? "Resolved" : "SLA remaining"}
          </div>
        </div>
      </div>

      <div className="text-xs" style={{ color: NOC.soft }}>
        Assigned to: {escalation.assigned_to ?? "Unassigned"} · Created: {formatTimestamp(escalation.created_at)}
      </div>

      {isResolved && escalation.resolution_note && (
        <div className="text-xs px-2 py-1" style={{ background: NOC.fog, color: NOC.muted }}>
          Note: {escalation.resolution_note}
        </div>
      )}

      {!isResolved && canResolve && (
        <div>
          <Btn
            onClick={() => setShowModal(true)}
            variant="terra"
          >
            Resolve
          </Btn>
        </div>
      )}

      {/* Resolve modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm space-y-3 p-5 shadow-xl" style={{ background: NOC.paper, border: `1px solid ${NOC.rule}` }}>
            <h3 className="font-semibold" style={{ color: NOC.ink }}>Resolve Escalation</h3>
            <div>
              <label className="block text-xs mb-1" style={{ color: NOC.muted }}>Resolution note (optional)</label>
              <textarea
                className="w-full resize-none border px-2 py-1 text-sm"
                style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe how this was resolved…"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="border px-3 py-1 text-sm"
                style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onResolve(escalation.id, note || undefined);
                  setShowModal(false);
                  setNote("");
                }}
                className="px-3 py-1 text-sm font-semibold"
                style={{ background: NOC.terra, color: NOC.cream }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

const TABS: { label: string; value: TabStatus }[] = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "All", value: "all" },
];

export default function EscalationsPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  const [activeTab, setActiveTab] = useState<TabStatus>("open");
  const { data, isLoading, isError } = useEscalations({ status: activeTab });
  const resolveEscalation = useResolveEscalation();

  // TODO: Wire to real session role — for now assume operator for UI rendering
  // Phase 65 will connect the role from the session context provider
  const canResolve = true;

  function handleResolve(id: string, note?: string) {
    resolveEscalation.mutate({ id, note });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Governance"
        title="Escalations"
        hint="Human-in-the-loop queue with SLA countdowns and operator resolution flow."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="escalations">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Escalations has its own status tab filter; the originating scope is shown for reference only and is NOT applied."}
          </div>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex gap-1" style={{ borderBottom: `1px solid ${NOC.rule}` }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              activeTab === tab.value
                ? "border-current"
                : "border-transparent",
            ].join(" ")}
            style={{ color: activeTab === tab.value ? NOC.terraDeep : NOC.soft }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load escalations. You may not have access or be logged in.
        </div>
      )}

      {resolveEscalation.isError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to resolve escalation: {(resolveEscalation.error as Error)?.message}
        </div>
      )}

      {isLoading && (
        <div className="text-sm" style={{ color: NOC.soft }}>Loading escalations...</div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {(data?.escalations ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm" style={{ color: NOC.soft }}>
              No {activeTab === "all" ? "" : activeTab} escalations found.
            </Card>
          ) : (
            (data?.escalations ?? []).map((escalation) => (
              <EscalationCard
                key={escalation.id}
                escalation={escalation}
                onResolve={handleResolve}
                canResolve={canResolve && escalation.status !== "resolved"}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
