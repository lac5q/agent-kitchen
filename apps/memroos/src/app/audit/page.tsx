"use client";


import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuditEntries, useAuditExportUrl } from "@/lib/api-client";import type { AuditEntriesFilter } from "@/lib/api-client";
import { AUDIT_EVENT_TYPES } from "@/lib/audit/event-types";
import type { AuditEntry } from "@/lib/audit/schema";
import { Btn, Card, PageHeader, Pill } from "@/components/shared/ui";

import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
const ALL_EVENT_TYPES = Object.values(AUDIT_EVENT_TYPES);

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <tr style={{ borderBottom: `1px solid ${NOC.rule}` }}>
      <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ color: NOC.muted }}>
        {formatTimestamp(entry.created_at)}
      </td>
      <td className="py-2 px-3 text-xs font-mono max-w-[120px] truncate" style={{ color: NOC.ink }} title={entry.actor_id}>
        {entry.actor_id}
      </td>
      <td className="py-2 px-3">
        <Pill>{entry.event_type}</Pill>
      </td>
      <td className="py-2 px-3 text-xs" style={{ color: NOC.muted }}>{entry.entity_type}</td>
      <td className="py-2 px-3 text-xs font-mono max-w-[150px] truncate" style={{ color: NOC.muted }} title={entry.entity_id}>
        {entry.entity_id}
      </td>
      <td className="py-2 px-3 text-xs max-w-[200px]" style={{ color: NOC.muted }} title={entry.reason ?? ""}>
        {truncate(entry.reason, 80)}
      </td>
    </tr>
  );
}


export default function AuditPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  const [filter, setFilter] = useState<AuditEntriesFilter>({ limit: 50 });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const queryFilter: AuditEntriesFilter = {
    ...filter,
    cursor,
  };

  const { data, isLoading, isError, isFetching } = useAuditEntries(queryFilter);
  const ndjsonUrl = useAuditExportUrl(filter, "ndjson");
  const csvUrl = useAuditExportUrl(filter, "csv");

  const applyFilter = useCallback(() => {
    setFilter({
      limit: 50,
      agentId: agentInput.trim() || undefined,
      actorId: actorInput.trim() || undefined,
      eventType: selectedEventType || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
    setAllEntries([]);
    setCursor(undefined);
  }, [actorInput, agentInput, fromDate, selectedEventType, toDate]);

  const loadMore = useCallback(() => {
    if (data?.nextCursor) {
      setAllEntries((prev) => {
        const next = [...prev, ...(data.entries ?? [])];
        return Array.from(new Map(next.map((entry) => [entry.id, entry])).values());
      });
      setCursor(data.nextCursor);
    }
  }, [data]);

  const displayed = cursor && isFetching
    ? allEntries
    : [...allEntries, ...(data?.entries ?? [])];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">

      <PageHeader
        eyebrow="Governance"
        title="Audit Log"
        hint="Immutable decision history: every agent action, SEAL proposal, and eval run."
      />
      {fromWindow && (
        <Card pad="sm" data-drilldown-from="audit">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Audit has its own filters; the originating scope is shown for reference only."}
          </div>
        </Card>
      )}
      <div className="flex gap-4 flex-wrap">        {/* Filter sidebar */}
        <Card className="w-64 shrink-0 space-y-4" style={{ background: NOC.fog }}>
          <h2 className="text-sm font-semibold" style={{ color: NOC.ink }}>Filters</h2>

          <div>
            <label className="block text-xs mb-1" style={{ color: NOC.muted }}>Agent ID</label>
            <input
              className="w-full border px-2 py-1 text-sm"
              style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              placeholder="agent-id"
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: NOC.muted }}>Actor ID</label>
            <input
              className="w-full border px-2 py-1 text-sm"
              style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="user or system"
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: NOC.muted }}>Event Type</label>
              <select
                className="w-full border px-2 py-1 text-sm"
                style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
              >
                <option value="">All event types</option>
                {ALL_EVENT_TYPES.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: NOC.muted }}>From</label>
            <input
              type="datetime-local"
              className="w-full border px-2 py-1 text-sm"
              style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: NOC.muted }}>To</label>
            <input
              type="datetime-local"
              className="w-full border px-2 py-1 text-sm"
              style={{ borderColor: NOC.ruleStrong, color: NOC.ink }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <Btn
            onClick={applyFilter}
            className="w-full rounded px-3 py-1.5 text-sm font-semibold transition"
            variant="terra"
          >
            Apply Filters
          </Btn>
        </Card>

        {/* Main table area */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: NOC.muted }}>
              {isLoading ? "Loading…" : `${displayed.length} entries`}
            </span>
            <div className="flex gap-2">
              <a
                href={ndjsonUrl}
                download
                className="border px-3 py-1 text-xs font-medium"
                style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
              >
                Export NDJSON
              </a>
              <a
                href={csvUrl}
                download
                className="border px-3 py-1 text-xs font-medium"
                style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
              >
                Export CSV
              </a>
            </div>
          </div>

          {isError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Failed to load audit entries. You may not have access or be logged in.
            </div>
          )}

          <div className="overflow-x-auto border" style={{ background: NOC.paper, borderColor: NOC.rule }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ background: NOC.fog, borderBottom: `1px solid ${NOC.ruleStrong}` }}>
                  {["Timestamp", "Actor", "Event Type", "Entity Type", "Entity ID", "Reason"].map((heading) => (
                    <th key={heading} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: NOC.muted }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
                {displayed.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm" style={{ color: NOC.soft }}>
                      No audit entries found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data?.nextCursor && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                className="border px-4 py-1.5 text-sm font-medium"
                style={{ borderColor: NOC.ruleStrong, color: NOC.muted }}
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
