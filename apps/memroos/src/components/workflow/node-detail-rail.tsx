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

const NODE_DETAILS: Record<string, NodeDetail> = {
  memroos: {
    title: "MemroOS core",
    sub: "Routing + memory + skills assembly + trust preflight",
    stats: [["Context packs / hr", "46"], ["Avg assembly", "420ms"], ["Reroute hits today", "11"]],
    notes: "Pulls from 3 stores → assembles → preflights → dispatches. Today: 184 packs shipped, 0 preflight blocks.",
  },
  memory: {
    title: "Memory store",
    sub: "Semantic + episodic + graph · live inventory on Memory page",
    stats: [["Recall telemetry", "missing"], ["Access counts", "not wired"], ["Consolidation", "see Memory"]],
    notes: "Workflow map avoids synthetic hit-rate, stale-fetch, and cold-read claims until recall/access telemetry is instrumented.",
  },
  skills: {
    title: "Skills",
    sub: "96 live · 3 drifting · 11 dormant",
    stats: [["Replays / 24h", "37"], ["W-lift avg", "+0.09"], ["Drift candidates", "3"]],
    notes: "Customer churn signal scan flagged — success dropped 67% after 4/22.",
  },
  knowledge: {
    title: "Knowledge corpus",
    sub: "5,854 files · 20 collections · QMD index",
    stats: [["Indexed", "5,854"], ["Stale", "108"], ["Avg freshness", "6.4d"]],
    notes: "business + brands collections idle for 34d+ — schedule re-ingest.",
  },
  gateway: {
    title: "Gateway",
    sub: "A2A · REST · MCP routing with Iris preflight",
    stats: [["Inbound / hr", "142"], ["Preflight blocks", "0"], ["Tool denials", "2"]],
    notes: "0 prompt-injection hits today. 2 tool denials on external_http for Cto.",
  },
  outcomes: {
    title: "Outcome capture",
    sub: "Feeds back into memory and SEAL substrate",
    stats: [["Captured / 24h", "184"], ["SEAL proposals", "4"], ["Promoted skills", "8"]],
    notes: "Loop closing — outcome → memory write average 1.8s.",
  },
  sophia:   { title: "Sophia · marketing", sub: "OpenClaw · v1.4 skills",    stats: [["Tasks 24h", "38"], ["Success", "92%"], ["Spend", "$0.92"]], notes: "On: Investor update draft. Top earner: +$58 saved by skill reuse." },
  maria:    { title: "Maria · content",    sub: "Hermes runtime",             stats: [["Tasks 24h", "24"], ["Success", "88%"], ["Spend", "$0.41"]], notes: "On: Launch blog tone selection. 2 drafts ready." },
  alba:     { title: "Alba · engineering", sub: "Hermes runtime",             stats: [["Tasks 24h", "47"], ["Success", "96%"], ["Spend", "$0.61"]], notes: "Idle. Last task INC-204 rollback @ 07:52." },

  gwen:     { title: "Gwen · social",      sub: "OpenClaw runtime",           stats: [["Tasks 24h", "18"], ["Success", "79%"], ["Spend", "$0.22"]], notes: "Idle. Next scheduled thread tomorrow 09:00." },
  cto:      { title: "Cto · eng",          sub: "Claude runtime",             stats: [["Tasks 24h", "6"],  ["Success", "67%"], ["Spend", "$0.34"]], notes: "⚠ Re-creating press-release skill (cos sim 0.91 to existing). Merge proposal queued." },
  telegram: { title: "Telegram inbound",   sub: "Webhook · group + DM",       stats: [["Msgs/d", "24"],   ["Latency", "180ms"], ["Errors", "0"]], notes: "" },
  email:    { title: "Email inbound",      sub: "IMAP · 2 mailboxes",         stats: [["Msgs/d", "81"],   ["Latency", "11s"],   ["Errors", "0"]], notes: "" },
  slack:    { title: "Slack inbound",      sub: "Events API · 4 channels",    stats: [["Msgs/d", "312"],  ["Latency", "90ms"],  ["Errors", "0"]], notes: "" },
  gong:     { title: "Calls (Gong)",       sub: "Webhook · transcripts",      stats: [["Calls/d", "14"],  ["Latency", "4m"],    ["Errors", "1"]], notes: "" },
  repo:     { title: "Repos · CI",         sub: "GitHub + GitNexus",          stats: [["Events/d", "247"],["Latency", "420ms"], ["Errors", "2"]], notes: "" },
};

const BOTTLENECKS = [
  { label: "Slack → Gateway",   value: "queue 38",    color: NOC.warn },
  { label: "Memory → Sophia",   value: "p95 1.4s",    color: NOC.warn },
  { label: "Cto · drift",       value: "success 67%", color: NOC.terra },
  { label: "Outcomes → memory", value: "avg 1.8s ✓",  color: NOC.success },
];

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

      {/* Bottlenecks */}
      <div style={{ background: NOC.paper, border: `1px solid ${NOC.rule}`, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NOC.ink }}>Bottlenecks · last 1h</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {BOTTLENECKS.map((b) => (
            <div
              key={b.label}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, fontSize: 12 }}
            >
              <span style={{ color: NOC.ink }}>{b.label}</span>
              <span style={{ fontFamily: NOC_FONT_MONO, fontSize: 11.5, color: b.color }}>{b.value}</span>
            </div>
          ))}
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
