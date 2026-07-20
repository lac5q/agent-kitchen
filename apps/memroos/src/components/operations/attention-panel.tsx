"use client";

import { useOperationsNoc } from "@/lib/api-client";
import type { NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import { Eyebrow, PillBtn, formatObservedAt } from "./noc-primitives";

const COLORS = {
  critical: NOC.terra,
  warning: NOC.warn,
  info: NOC.info,
};

export function AttentionPanel({ filters }: { filters: NocFilters }) {
  const noc = useOperationsNoc(filters);
  const items = noc.data?.attention ?? [];

  return (
    <section style={{ padding: "0 28px 14px" }} aria-label="Attention">
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Eyebrow>Attention</Eyebrow>
          <span style={{ fontFamily: NOC_FONT_MONO, fontSize: 11, color: NOC.soft }}>
            {noc.isLoading ? "loading" : `${items.length} item${items.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {items.length === 0 && !noc.isLoading ? (
          <div data-status="all-clear" style={{ color: NOC.success, fontSize: 13 }}>
            All clear — no cron failures, pending approvals, security findings, or stale sources.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((item) => (
              <div
                key={item.id}
                data-attention-severity={item.severity}
                style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${NOC.rule}`, paddingTop: 8 }}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[item.severity], flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: NOC.ink }}>{item.title}</div>
                  {item.detail ? <div style={{ fontSize: 11, color: NOC.soft }}>{item.detail}</div> : null}
                </div>
                <span style={{ fontFamily: NOC_FONT_MONO, fontSize: 10.5, color: NOC.soft, whiteSpace: "nowrap" }}>
                  {formatObservedAt(item.timestamp)}
                </span>
                {item.target ? <PillBtn href={item.target}>Open</PillBtn> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
