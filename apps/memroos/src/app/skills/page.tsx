"use client";

/**
 * /skills — Governed Skill Registry
 *
 * Shows cross-harness SKILL.md contracts imported into the governed registry.
 * Separate from /cookbooks (filesystem-discovered skills).
 *
 * Features:
 * - Paginated fetch from GET /api/skills/import (max 100 per page)
 * - Non-blocking data fetching via useQuery
 * - Completeness percentage bar per skill
 * - Missing-field indicators
 * - Dispatch status badges (enabled / incomplete / disabled)
 * - Source harness, risk tier, owner columns
 * - Incomplete contracts clearly marked as not ready for dispatch
 *
 * Plan: 72-05 (SKILL-01, SKILL-02, SKILL-04)
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSkillRegistry, useSkillSuggestions } from "@/lib/api-client";
import type { SkillRegistryItem, SkillSuggestion } from "@/lib/api-client";
import { Card, PageHeader, Stat } from "@/components/shared/ui";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

// ── Pagination constants ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

// ── Badge helpers ─────────────────────────────────────────────────────────────
function DispatchBadge({ status }: { status: SkillRegistryItem["dispatch_status"] }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    enabled: { bg: NOC.successBg, color: NOC.success, label: "Enabled" },
    incomplete: { bg: NOC.warnBg, color: NOC.warn, label: "Incomplete" },
    disabled: { bg: NOC.fog, color: NOC.soft, label: "Disabled" },
  };
  const s = styles[status] ?? styles.disabled;
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function RiskBadge({ tier }: { tier: string }) {
  const palette: Record<string, { bg: string; color: string }> = {
    low: { bg: NOC.successBg, color: NOC.success },
    medium: { bg: NOC.warnBg, color: NOC.warn },
    high: { bg: "#fde8e8", color: "#9b1c1c" },
    critical: { bg: "#fde8e8", color: "#7f1d1d" },
  };
  const p = palette[tier.toLowerCase()] ?? { bg: NOC.fog, color: NOC.soft };
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: p.bg, color: p.color }}
    >
      {tier}
    </span>
  );
}

function HarnessBadge({ harness }: { harness: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: NOC.infoBg, color: NOC.info }}
    >
      {harness}
    </span>
  );
}

function SuggestionStatusBadge({ status }: { status: SkillSuggestion["status"] }) {
  const palette: Record<SkillSuggestion["status"], { bg: string; color: string; label: string }> = {
    proposed: { bg: NOC.infoBg, color: NOC.info, label: "Proposed" },
    approved: { bg: NOC.warnBg, color: NOC.warn, label: "Approved" },
    promoted: { bg: NOC.successBg, color: NOC.success, label: "Promoted" },
    dismissed: { bg: NOC.fog, color: NOC.soft, label: "Dismissed" },
  };
  const p = palette[status];
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: p.bg, color: p.color }}
    >
      {p.label}
    </span>
  );
}

function SkillSuggestionRow({ suggestion }: { suggestion: SkillSuggestion }) {
  const missingHarnesses = Object.entries(suggestion.comparedHarnesses)
    .filter(([, value]) => !value.exists)
    .map(([harness]) => harness);

  return (
    <div className="border-b py-4" style={{ borderColor: NOC.rule }}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: NOC.ink }}>
              {suggestion.name}
            </span>
            <SuggestionStatusBadge status={suggestion.status} />
            <span className="font-mono text-xs" style={{ color: NOC.success }}>
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: NOC.muted }}>
            {suggestion.recommendation}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: NOC.soft }}>
        <span>Pattern: <span className="font-mono">{suggestion.sourcePattern}</span></span>
        {missingHarnesses.length > 0 && (
          <span>Missing in: <span className="font-mono">{missingHarnesses.join(", ")}</span></span>
        )}
      </div>
      {suggestion.evidence.length > 0 && (
        <div className="mt-2 text-xs" style={{ color: NOC.muted }}>
          Evidence: <span className="font-mono">{suggestion.evidence.slice(0, 2).join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

// ── Completeness bar ──────────────────────────────────────────────────────────
function CompletenessBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    clamped === 100 ? NOC.success : clamped >= 75 ? NOC.warn : "#c0392b";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden"
        style={{ background: NOC.rule }}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color }}>
        {clamped}%
      </span>
    </div>
  );
}

// ── Not-ready callout ─────────────────────────────────────────────────────────
function NotReadyBanner({ missingFields }: { missingFields: string[] }) {
  if (missingFields.length === 0) return null;
  return (
    <div
      className="mt-2 rounded px-3 py-2 text-xs"
      style={{ background: NOC.warnBg, color: NOC.warn }}
    >
      <span className="font-semibold">Not ready for dispatch.</span>{" "}
      Missing:{" "}
      <span className="font-mono">{missingFields.join(", ")}</span>
    </div>
  );
}

// ── Skill row card ────────────────────────────────────────────────────────────
function SkillRow({ skill }: { skill: SkillRegistryItem }) {
  const [expanded, setExpanded] = useState(false);
  const isIncomplete = skill.dispatch_status !== "enabled";

  return (
    <div
      className="border-b py-4"
      style={{ borderColor: NOC.rule }}
    >
      <div className="flex flex-wrap items-start gap-3">
        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm" style={{ color: NOC.ink }}>
              {skill.name}
            </span>
            <DispatchBadge status={skill.dispatch_status} />
            <HarnessBadge harness={skill.source_harness} />
            <RiskBadge tier={skill.risk_tier} />
          </div>
          {skill.description && (
            <p className="mt-1 text-xs" style={{ color: NOC.muted }}>
              {skill.description}
            </p>
          )}
        </div>

        {/* Completeness */}
        <div className="shrink-0">
          <CompletenessBar pct={skill.completeness_pct} />
        </div>
      </div>

      {/* Metadata row */}
      <div className="mt-2 flex flex-wrap gap-4 text-xs" style={{ color: NOC.soft }}>
        {skill.owner && (
          <span>Owner: <span className="font-medium" style={{ color: NOC.muted }}>{skill.owner}</span></span>
        )}
        {skill.version && (
          <span>v{skill.version}</span>
        )}
        <span>
          Imported:{" "}
          <span className="font-medium" style={{ color: NOC.muted }}>
            {new Date(skill.imported_at).toLocaleDateString()}
          </span>
        </span>
        {skill.imported_by && (
          <span>By: <span className="font-medium" style={{ color: NOC.muted }}>{skill.imported_by}</span></span>
        )}
      </div>

      {/* Not-ready banner */}
      {isIncomplete && skill.missing_fields.length > 0 && (
        <NotReadyBanner missingFields={skill.missing_fields} />
      )}

      {/* Expand/collapse verification checks */}
      {skill.verification_checks_list.length > 0 && (
        <div className="mt-2">
          <button
            className="text-xs underline"
            style={{ color: NOC.info }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Show"} verification checks ({skill.verification_checks_list.length})
          </button>
          {expanded && (
            <ul className="mt-1 space-y-0.5 pl-4 text-xs" style={{ color: NOC.muted }}>
              {skill.verification_checks_list.map((check, i) => (
                <li key={i} className="list-disc">{check}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
type FilterStatus = "all" | "enabled" | "incomplete" | "disabled";
type FilterHarness = string;

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SkillsRegistryPage() {
  const search = useSearchParams();
  const fromWindow = search?.get("from_window") ?? null;
  const fromWorkspace = search?.get("from_workspace") ?? null;
  const fromScopeNote = search?.get("from_scope_note") ?? null;
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterHarness, setFilterHarness] = useState<FilterHarness>("all");

  const offset = page * PAGE_SIZE;

  const { data, isLoading, isError } = useSkillRegistry({
    offset,
    limit: PAGE_SIZE,
    dispatch_status: filterStatus !== "all" ? filterStatus : undefined,
    source_harness: filterHarness !== "all" ? filterHarness : undefined,
  });
  const suggestions = useSkillSuggestions(30);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Derive unique harnesses from current page for filter (best-effort)
  const knownHarnesses = Array.from(new Set(items.map((s) => s.source_harness)));

  const enabledCount = items.filter((s) => s.dispatch_status === "enabled").length;
  const incompleteCount = items.filter((s) => s.dispatch_status !== "enabled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Skills"
        title="Governed Skill Registry"
        hint="MemRoOS-suggested skills, cross-harness SKILL.md contracts, dispatch readiness, and contract verification at a glance."
      />

      {fromWindow && (
        <Card pad="sm" data-drilldown-from="skills">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>
            Drilldown from Operations NOC
          </div>
          <div className="mt-1 text-xs" style={{ color: NOC.muted }}>
            Originating NOC filters: <span style={{ fontFamily: NOC_FONT_MONO }}>window={fromWindow}, workspace={fromWorkspace ?? "unknown"}</span>.
            {" "}
            {fromScopeNote ?? "Skills registry is a cumulative snapshot; the originating scope is shown for reference only and is NOT applied."}
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: NOC.ink }}>
              Suggested Skills
            </h2>
            <p className="mt-1 text-xs" style={{ color: NOC.muted }}>
              MemRoOS recommendations from the last 30 days of activity, compared against harness coverage.
            </p>
          </div>
          <span className="text-xs font-mono" style={{ color: NOC.soft }}>
            {suggestions.data?.timestamp
              ? new Date(suggestions.data.timestamp).toLocaleString()
              : "loading"}
          </span>
        </div>
        {suggestions.isLoading && (
          <div className="py-8 text-center text-sm" style={{ color: NOC.soft }}>
            Loading suggested skills...
          </div>
        )}
        {suggestions.isError && (
          <p className="py-6 text-center text-sm" style={{ color: NOC.warn }}>
            Failed to load suggested skills.
          </p>
        )}
        {!suggestions.isLoading && !suggestions.isError && (suggestions.data?.suggestions.length ?? 0) === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: NOC.soft }}>
            No activity-backed suggestions found for this window.
          </p>
        )}
        {!suggestions.isLoading && !suggestions.isError && suggestions.data?.suggestions.map((suggestion) => (
          <SkillSuggestionRow key={suggestion.id} suggestion={suggestion} />
        ))}
      </Card>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <Stat label="Total (this view)" value={total} />
        </Card>
        <Card>
          <Stat label="Ready for Dispatch" value={enabledCount} tone="success" />
        </Card>
        <Card>
          <Stat label="Incomplete Contracts" value={incompleteCount} tone="warn" />
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(["all", "enabled", "incomplete", "disabled"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            className="border px-3 py-1 text-sm font-semibold"
            style={{
              borderColor: filterStatus === s ? NOC.terra : NOC.rule,
              color: filterStatus === s ? NOC.terraDeep : NOC.muted,
              background: filterStatus === s ? NOC.peach : NOC.paper,
            }}
            onClick={() => {
              setFilterStatus(s);
              setPage(0);
            }}
          >
            {s === "all" ? "All statuses" : s}
          </button>
        ))}

        {knownHarnesses.length > 0 && (
          <>
            <span className="px-2 py-1 text-xs" style={{ color: NOC.soft }}>|</span>
            {(["all", ...knownHarnesses] as FilterHarness[]).map((h) => (
              <button
                key={h}
                className="border px-3 py-1 text-sm font-semibold"
                style={{
                  borderColor: filterHarness === h ? NOC.info : NOC.rule,
                  color: filterHarness === h ? NOC.info : NOC.muted,
                  background: filterHarness === h ? NOC.infoBg : NOC.paper,
                }}
                onClick={() => {
                  setFilterHarness(h);
                  setPage(0);
                }}
              >
                {h === "all" ? "All harnesses" : h}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Skill list */}
      <Card>
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          </div>
        )}

        {isError && (
          <p className="py-6 text-center text-sm" style={{ color: NOC.warn }}>
            Failed to load governed registry skills. Check API availability.
          </p>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold" style={{ color: NOC.ink }}>
              No governed skills found
            </p>
            <p className="mt-1 text-xs" style={{ color: NOC.muted }}>
              Import a SKILL.md contract via{" "}
              <code className="font-mono">POST /api/skills/import</code> to populate this
              registry.
            </p>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div>
            {items.map((skill) => (
              <SkillRow key={`${skill.source_harness}-${skill.name}`} skill={skill} />
            ))}
          </div>
        )}
      </Card>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: NOC.soft }}>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} skills
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="border px-3 py-1 text-sm disabled:opacity-40"
              style={{ borderColor: NOC.rule, color: NOC.muted, background: NOC.paper }}
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="border px-3 py-1 text-sm disabled:opacity-40"
              style={{ borderColor: NOC.rule, color: NOC.muted, background: NOC.paper }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Cross-link to filesystem-discovered skills */}
      <div
        className="border-t pt-4 text-xs"
        style={{ borderColor: NOC.rule, color: NOC.soft }}
      >
        Filesystem-discovered skills and skill health are available on the{" "}
        <a
          href="/cookbooks"
          className="underline"
          style={{ color: NOC.info }}
        >
          Skills (Cookbooks)
        </a>{" "}
        page.
      </div>
    </div>
  );
}
