"use client";

import Link from "next/link";
import type { NocWindow, NocWorkspace } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";


type Drilldown = {
  label: string;
  href: string;
  // When true, the destination honors the NOC window/workspace via URL
  // parameters; when false, the destination page has a different scope and
  // the link only carries the scope as a visible disclosure badge.
  carriesScope: boolean;
  scopeNote: string;
};

const QUICK_LINKS: Drilldown[] = [
  {
    label: "Ledger",
    href: "/ledger",
    carriesScope: false,
    scopeNote:
      "Ledger has its own date-range selector — current NOC window is shown on the destination for reference only.",
  },
  {
    label: "Memory",
    href: "/notebooks",
    carriesScope: false,
    scopeNote:
      "Memory page has its own filters — current NOC window/workspace is shown on the destination for reference only.",
  },
  {
    label: "Dispatch",
    href: "/dispatch",
    carriesScope: false,
    scopeNote:
      "Dispatch page has its own filters — current NOC window/workspace is shown on the destination for reference only.",
  },
  {
    label: "Governance",
    href: "/audit",
    carriesScope: false,
    scopeNote:
      "Audit page has its own filters — current NOC window/workspace is shown on the destination for reference only.",
  },
];
interface NocHeaderProps {
  windowLabel: NocWindow;
  workspace: NocWorkspace;
  onWindowChange: (value: NocWindow) => void;
  onWorkspaceChange: (value: NocWorkspace) => void;
}

export function NocHeader({ windowLabel, workspace, onWindowChange, onWorkspaceChange }: NocHeaderProps) {
  function exportReport() {
    const payload = {
      surface: "operations-noc",
      window: windowLabel,
      workspace,
      generatedAt: new Date().toISOString(),
      note: "NOC export contains current UI filter context. Live panel payload export is tracked by NOC-14.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `memroos-noc-${windowLabel}-${workspace}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  const controlStyle = {
    alignItems: "center",
    background: NOC.paper,
    border: `1px solid ${NOC.ruleStrong}`,
    color: NOC.ink,
    display: "inline-flex",
    fontFamily: NOC_FONT_MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    minHeight: 30,
    padding: "4px 9px",
    textDecoration: "none",
    textTransform: "uppercase" as const,
  };

  return (
    <div
      style={{
        padding: "20px 28px 14px",
        display: "flex",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 18,
        background: NOC.cream,
      }}
    >
      <div style={{ flex: "1 1 520px", minWidth: 320 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: 99,
              background: NOC.warn, display: "inline-block",
            }}
          />
          <div
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.14em",
              color: NOC.terra, textTransform: "uppercase",
            }}
          >
            Operations · live telemetry
          </div>
          <span style={{ fontSize: 11, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
            explicit gaps shown
          </span>
        </div>
        <h1
          style={{
            margin: "6px 0 2px", fontSize: 26, fontWeight: 600,
            letterSpacing: "-0.02em", color: NOC.ink,
          }}
        >
          Agent NOC
        </h1>
        <div style={{ fontSize: 13.5, color: NOC.muted, maxWidth: 760 }}>
          Run the agent fleet like infrastructure. Panels use live local sources where available; missing streams render explicit gaps instead of fabricated numbers.
        </div>
      </div>
      <div style={{ display: "flex", flex: "1 1 420px", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>

        {QUICK_LINKS.map((link) => {
          // Always carry the originating window/workspace in the URL so
          // downstream pages can disclose or honor the scope. Destinations
          // that partition by NOC scope can read these params; others
          // surface them as a visible scope badge.
          const params = new URLSearchParams();
          params.set("from_window", windowLabel);
          params.set("from_workspace", workspace);
          params.set("from_scope_note", link.scopeNote);
          const dest = `${link.href}?${params.toString()}`;
          return (
            <Link
              key={link.href}
              href={dest}
              data-drilldown={link.label}
              data-scope-carries={link.carriesScope ? "yes" : "no"}
              title={link.scopeNote}
              style={{
                alignItems: "center",
                background: NOC.paper,
                border: `1px solid ${NOC.ruleStrong}`,
                color: NOC.ink,
                display: "inline-flex",
                fontFamily: NOC_FONT_MONO,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                minHeight: 30,
                padding: "4px 9px",
                textDecoration: "none",
                textTransform: "uppercase",
              }}
            >
              {link.label} · {windowLabel}/{workspace}
            </Link>
          );
        })}        <label style={{ ...controlStyle, gap: 6 }}>
          <span>Date</span>
          <select
            aria-label="NOC date range"
            value={windowLabel}
            onChange={(event) => onWindowChange(event.target.value as NocWindow)}
            style={{
              background: "transparent",
              border: 0,
              color: NOC.ink,
              fontFamily: NOC_FONT_MONO,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
        </label>
        <label style={{ ...controlStyle, gap: 6 }}>
          <span>Workspace</span>
          <select
            aria-label="NOC workspace"
            value={workspace}
            onChange={(event) => onWorkspaceChange(event.target.value as NocWorkspace)}
            style={{
              background: "transparent",
              border: 0,
              color: NOC.ink,
              fontFamily: NOC_FONT_MONO,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <option value="all">All</option>
            <option value="local">Local</option>
            <option value="remote">Remote</option>
          </select>
        </label>
        <button
          onClick={exportReport}
          style={{ ...controlStyle, background: NOC.ink, color: NOC.cream, borderColor: NOC.ink }}
        >
          Export report
        </button>
      </div>
    </div>
  );
}
