"use client";

import type React from "react";
import Link from "next/link";
import { NOC, NOC_FONT_BODY, NOC_FONT_MONO } from "@/lib/noc-theme";

interface NodeDetail {
  title: string;
  sub: string;
  stats: [string, string][];
  notes: string;
}

/**
 * Detail for a selected node.
 *
 * This used to be a second hardcoded surface alongside the canvas: the same
 * five fixed agent names, so clicking a node on a host with a different
 * registry showed a confidently wrong description. Structural nodes stay
 * declared here (there is exactly one Gateway); everything derived carries its
 * own label and sub from the topology payload.
 */
const STRUCTURAL_DETAILS: Record<string, NodeDetail> = {
  memroos:   { title: "MemroOS core", sub: "Routing + memory + skills assembly + trust preflight", stats: [], notes: "" },
  gateway:   { title: "Gateway",      sub: "A2A · REST · MCP routing with Iris preflight",         stats: [], notes: "" },
  outcomes:  { title: "Outcomes",     sub: "Feeds back into memory and SEAL substrate",            stats: [], notes: "" },
};

/**
 * Route for a node. Derived ids are prefixed (`agent:`, `src:`) by the
 * topology builder, so a prefix match covers every agent and source without
 * enumerating them.
 */
function routeFor(nodeId: string | null): string {
  if (!nodeId) return "/";
  if (nodeId.startsWith("agent:")) return "/dispatch";
  // Sources are already drawn on this page, so they route to /flow and the CTA
  // suppresses itself rather than offering a link to the current page.
  if (nodeId.startsWith("src:")) return "/flow";
  const structural: Record<string, string> = {
    memroos: "/",
    gateway: "/agents",
    outcomes: "/business-ops",
    memory: "/notebooks",
    skills: "/skills",
    knowledge: "/library",
  };
  return structural[nodeId] ?? "/";
}

interface NodeDetailRailProps {
  nodeId: string | null;
  /** Live label/sub for the selected node, from the topology payload. */
  node?: { label: string; sub: string } | null;
}

export function NodeDetailRail({ nodeId, node }: NodeDetailRailProps) {
  // Prefer the live node: its label and sub are whatever the registry or store
  // actually reports. Fall back to the structural table, then to the core.
  const detail: NodeDetail = node
    ? { title: node.label, sub: node.sub, stats: [], notes: "" }
    : (nodeId ? STRUCTURAL_DETAILS[nodeId] : null) ?? STRUCTURAL_DETAILS.memroos;
  const route = routeFor(nodeId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Selected node card */}
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 14 }}>
        <div style={{ fontSize: 10, color: NOC.soft, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Selected
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, fontFamily: NOC_FONT_BODY }}>
          {detail.title}
        </div>
        <div style={{ fontSize: 11.5, color: NOC.soft, marginTop: 2 }}>
          {detail.sub}
        </div>

        {detail.stats.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {detail.stats.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 9.5, color: NOC.soft, letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase" }}>
                  {k}
                </div>
                <div style={{ fontFamily: NOC_FONT_MONO, fontSize: 14, color: NOC.ink, marginTop: 2 }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
        )}

        {detail.notes && (
          <div style={{ marginTop: 12, padding: 10, background: NOC.fog, fontSize: 12, color: NOC.muted, lineHeight: 1.5 }}>
            {detail.notes}
          </div>
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          {route === "/flow" ? (
            <span
              style={{
                color: NOC.soft,
                fontFamily: NOC_FONT_MONO,
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Already on map
            </span>
          ) : (
            <Link href={route} style={{ ...pillBtn(NOC.paper, NOC.ink, NOC.ruleStrong), textDecoration: "none" }}>
              Open page
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}

function pillBtn(bg: string, fg: string, br: string, pad = "6px 11px", sz = 12): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    border: `1px solid ${br}`,
    padding: pad,
    fontSize: sz,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontFamily: NOC_FONT_BODY,
    cursor: "pointer",
  };
}
