"use client";

import Link from "next/link";

import { useMemoryStats, useMemoryTierHealth } from "@/lib/api-client";
import { nocWindowToTimeSeriesWindow, type NocFilters, type NocWindow, type NocWorkspace } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { NocPanelHeader, Mono } from "./noc-primitives";

function buildDrilldownHref(
  baseHref: string,
  filters: { window: NocWindow; workspace: NocWorkspace },
  scopeNote: string
): string {
  const params = new URLSearchParams();
  params.set("from_window", filters.window);
  params.set("from_workspace", filters.workspace);
  params.set("from_scope_note", scopeNote);
  return `${baseHref}?${params.toString()}`;
}

interface MemoryNotDigestedProps {
  filters?: NocFilters;
}

export function MemoryNotDigested({ filters }: MemoryNotDigestedProps) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const memory = useMemoryStats({
    window: nocWindowToTimeSeriesWindow(effectiveFilters.window),
    workspace: effectiveFilters.workspace,
  });
  const health = useMemoryTierHealth();
  const sources = memory.data?.sources ?? [];
  const lastRun = memory.data?.lastRun;
  const pending = memory.data?.pendingUnconsolidated ?? 0;
  const lastRunFailed = lastRun?.status === "failed";
  const lastRunError = lastRun?.error_message?.replace(/\s+/g, " ").slice(0, 120);
  const tierFailures = health.data?.tiers.filter((tier) => tier.status !== "up") ?? [];
  const rows = [
    ...(lastRunFailed
      ? [
          {
            name: "Consolidation blocked",
            meta: lastRunError ?? `failed at ${lastRun.started_at}`,
            value: memory.data?.recentFailures24h ?? 1,
            href: buildDrilldownHref(
              "/library",
              effectiveFilters,
              "Library page has its own sources/index selectors; originating NOC filters are shown for reference only and are NOT applied."
            ),
            tone: NOC.terra,
          },
        ]
      : []),
    {
      name: "Pending unconsolidated messages",
      meta: lastRun
        ? `last run ${lastRun.status} · batch ${lastRun.batch_size}`
        : "no consolidation run recorded",
      value: pending,
      href: buildDrilldownHref(
        "/notebooks",
        effectiveFilters,
        "Memory page has its own filters; originating NOC filters are shown for reference only and are NOT applied."
      ),
      tone: pending > 0 ? NOC.warn : NOC.success,
    },
    ...tierFailures.map((tier) => ({
      name: `${tier.tier} backend ${tier.status}`,
      meta: tier.detail ?? tier.backend,
      value: tier.count ?? 0,
      href: buildDrilldownHref(
        "/notebooks",
        effectiveFilters,
        "Memory page has its own filters; originating NOC filters are shown for reference only and are NOT applied."
      ),
      tone: NOC.terra,
    })),
    ...sources.slice(0, Math.max(0, 6 - tierFailures.length)).map((source) => ({
      name: source.agent_id,
      meta: "ingested message source",
      value: source.cnt,
      href: buildDrilldownHref(
        `/notebooks?q=${encodeURIComponent(source.agent_id)}`,
        effectiveFilters,
        "Memory page has its own filters; originating NOC filters are shown for reference only and are NOT applied."
      ),
      tone: NOC.soft,
    })),
  ];

  return (
    <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}` }}>
      <div style={{ padding: 16 }}>
        <NocPanelHeader
          title="Memory digestion"
          hint="Live consolidation state, memory backend health, and source inventory."
          right={<Mono color={NOC.soft} size={11}>{memory.isError ? "failed" : `${sources.length} sources`}</Mono>}
        />
      </div>
      {memory.isError && (
        <div style={{ padding: "11px 16px", borderTop: `1px solid ${NOC.rule}`, color: NOC.terra, fontSize: 12 }}>
          Failed to load /api/memory-stats.
        </div>
      )}
      {!memory.isError && rows.length === 0 && (
        <div style={{ padding: "11px 16px", borderTop: `1px solid ${NOC.rule}`, color: NOC.soft, fontSize: 12 }}>
          No memory rows found. New memories will stay at zero until messages are ingested and consolidation runs.
        </div>
      )}
      {rows.map((m) => (
        <div
          key={m.name}
          style={{
            padding: "11px 16px",
            borderTop: `1px solid ${NOC.rule}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 13, color: NOC.ink, marginBottom: 2 }}>
              {m.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: NOC.soft,
                fontFamily: NOC_FONT_MONO,
                overflowWrap: "anywhere",
              }}
            >
              {m.meta}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
            <Mono color={m.tone} size={13}>
              {m.value}
            </Mono>
            <Link href={m.href} style={{ border: `1px solid ${NOC.ruleStrong}`, padding: "6px 8px", textTransform: "uppercase", fontSize: 11, color: NOC.ink, textDecoration: "none", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>
              Investigate
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
