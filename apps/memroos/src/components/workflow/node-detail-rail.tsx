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

// Node details: titles and routes only. Stats are wired from real APIs — no hardcoded numbers.
const NODE_DETAILS: Record<string, NodeDetail> = {
  memroos:   { title: "MemroOS core",  sub: "Routing + memory + skills assembly + trust preflight", stats: [], notes: "" },
  memory:    { title: "Memory store",  sub: "Semantic + episodic + graph",                         stats: [], notes: "" },
  skills:    { title: "Skills",        sub: "Skill registry",                                      stats: [], notes: "" },
  knowledge: { title: "Knowledge",     sub: "Knowledge corpus + QMD index",                        stats: [], notes: "" },
  gateway:   { title: "Gateway",       sub: "A2A · REST · MCP routing with Iris preflight",        stats: [], notes: "" },
  outcomes:  { title: "Outcomes",      sub: "Feeds back into memory and SEAL substrate",           stats: [], notes: "" },
  sophia:    { title: "Sophia",        sub: "Marketing agent",                                     stats: [], notes: "" },
  maria:     { title: "Maria",         sub: "Content agent",                                       stats: [], notes: "" },
  alba:      { title: "Alba",          sub: "Engineering agent",                                   stats: [], notes: "" },
  gwen:      { title: "Gwen",          sub: "Social agent",                                        stats: [], notes: "" },
  cto:       { title: "Cto",           sub: "Engineering agent",                                   stats: [], notes: "" },
  telegram:  { title: "Telegram",      sub: "Webhook · group + DM",                                stats: [], notes: "" },
  email:     { title: "Email",         sub: "IMAP inbound",                                        stats: [], notes: "" },
  slack:     { title: "Slack",         sub: "Events API inbound",                                  stats: [], notes: "" },
  gong:      { title: "Calls (Gong)",  sub: "Webhook · transcripts",                               stats: [], notes: "" },
  repo:      { title: "Repos · CI",    sub: "GitHub + GitNexus",                                   stats: [], notes: "" },
};

const NODE_ROUTES: Record<string, string> = {
  memroos: "/",
  memory: "/notebooks",
  skills: "/skills",
  knowledge: "/library",
  gateway: "/agents",
  outcomes: "/business-ops",
  sophia: "/dispatch",
  maria: "/dispatch",
  alba: "/dispatch",

  gwen: "/dispatch",
  cto: "/dispatch",
  telegram: "/flow",
  email: "/flow",
  slack: "/flow",
  gong: "/flow",
  repo: "/library",
};

interface NodeDetailRailProps {
  nodeId: string | null;
}

export function NodeDetailRail({ nodeId }: NodeDetailRailProps) {
  const detail = (nodeId ? NODE_DETAILS[nodeId] : null) ?? NODE_DETAILS.memroos;
  const route = (nodeId && NODE_ROUTES[nodeId]) || "/";

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
