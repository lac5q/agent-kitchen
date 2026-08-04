"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Edit3, Search, ShieldCheck } from "lucide-react";

import { Btn, Card, Pill } from "@/components/shared/ui";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  useUpdateSkillReviewMutation,
  type SkillReviewStatus,
  type SkillWorkflowItem,
  type SkillWorkflowStage,
} from "@/lib/api-client";

export interface SkillsListProps {
  totalSkills: number;
  allSkills: string[];
  skillDetails?: SkillWorkflowItem[];
  coverageGaps: string[];
  coverageTelemetryStatus?: "tracked" | "untracked";
}

const STAGES: Array<{ id: SkillWorkflowStage; title: string; description: string }> = [
  { id: "agent-limited", title: "Agent-Limited", description: "Useful locally, still needs operator review." },
  { id: "general", title: "General Skill", description: "Approved for repeat use across teams." },
  { id: "enterprise", title: "Enterprise Skill", description: "Governed, auditable, and promotion-ready." },
];

const STATUS_COPY: Record<SkillReviewStatus, string> = {
  unreviewed: "Unreviewed",
  "in-review": "In review",
  "changes-requested": "Changes requested",
  approved: "Approved",
  "enterprise-ready": "Enterprise ready",
};

export function SkillsList({
  totalSkills,
  allSkills,
  skillDetails = [],
  coverageGaps,
  coverageTelemetryStatus = "tracked",
}: SkillsListProps) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(skillDetails[0]?.name ?? allSkills[0] ?? null);

  const fallbackItems = useMemo<SkillWorkflowItem[]>(
    () =>
      allSkills.map((name) => ({
        name,
        title: name,
        path: "",
        description: "Skill metadata is still being indexed.",
        bodyPreview: "",
        stage: "agent-limited",
        reviewStatus: coverageGaps.includes(name) ? "in-review" : "unreviewed",
        reviewNotes: "",
        draftBody: "",
        changeReason: "",
        owner: "unassigned",
        tags: [],
        health: coverageGaps.includes(name) ? "coverage-gap" : "ready",
        lastActivityAt: null,
        maturityScore: coverageGaps.includes(name) ? 35 : 50,
        updatedAt: null,
        approvedAt: null,
        usageCount: 0,
      })),
    [allSkills, coverageGaps]
  );

  const items = skillDetails.length > 0 ? skillDetails : fallbackItems;
  const selected = items.find((skill) => skill.name === selectedName) ?? items[0] ?? null;
  const gapCount = coverageGaps.length;
  const isCoverageTracked = coverageTelemetryStatus === "tracked";

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((skill) =>
      [skill.name, skill.title, skill.description, skill.owner, skill.stage, skill.reviewStatus, ...skill.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [items, query]);

  const counts = useMemo(() => {
    return STAGES.reduce<Record<SkillWorkflowStage, number>>(
      (acc, stage) => {
        acc[stage.id] = items.filter((skill) => skill.stage === stage.id).length;
        return acc;
      },
      { "agent-limited": 0, general: 0, enterprise: 0 }
    );
  }, [items]);

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm" style={{ color: NOC.muted }}>
          No skills found.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 md:grid-cols-[minmax(12rem,1.2fr)_minmax(16rem,2fr)]">
        <div>
          <p className="text-xs font-bold uppercase" style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}>
            Review pipeline
          </p>
          <h3 className="mt-2 text-2xl font-semibold" style={{ color: NOC.ink }}>
            Move skills from local know-how to enterprise workflow.
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: NOC.muted }}>
            Inspect the source, capture review notes, approve repeatable skills, and promote governed procedures once they are ready for broad operator use.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STAGES.map((stage, index) => (
            <div key={stage.id} style={{ borderLeft: `3px solid ${stageColor(stage.id)}`, paddingLeft: 12 }}>
              <p className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
                0{index + 1}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <strong className="text-sm" style={{ color: NOC.ink }}>
                  {stage.title}
                </strong>
                <span className="text-lg font-semibold" style={{ color: NOC.ink }}>
                  {counts[stage.id]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5" style={{ color: NOC.muted }}>
                {stage.description}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="terra">{totalSkills} skills</Pill>
        <Pill tone={isCoverageTracked && gapCount > 0 ? "warn" : "neutral"}>
          {isCoverageTracked ? `${gapCount} coverage gaps` : "coverage untracked"}
        </Pill>
        <Pill tone="info">{items.filter((skill) => skill.reviewStatus === "approved").length} approved</Pill>
        <Pill tone="success">{items.filter((skill) => skill.reviewStatus === "enterprise-ready").length} enterprise ready</Pill>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,360px)_minmax(0,1fr)_minmax(16rem,360px)]">
        <Card className="space-y-3" pad="sm">
          <label className="flex items-center gap-2 border px-3 py-2" style={{ borderColor: NOC.rule, background: NOC.paper }}>
            <Search size={15} color={NOC.soft} />
            <input
              aria-label="Search skills"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skill, owner, stage..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: NOC.ink }}
            />
          </label>

          <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
            {filteredItems.map((skill) => {
              const active = skill.name === selected?.name;
              return (
                <button
                  key={skill.name}
                  type="button"
                  onClick={() => setSelectedName(skill.name)}
                  className="w-full border p-3 text-left transition"
                  style={{
                    background: active ? NOC.peach : NOC.paper,
                    borderColor: active ? NOC.terra : NOC.rule,
                    color: NOC.ink,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{skill.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: NOC.muted }}>
                        {skill.description}
                      </p>
                    </div>
                    <StatusPill status={skill.reviewStatus} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
                      {stageLabel(skill.stage)}
                    </span>
                    <span className="text-xs" style={{ color: skill.health === "coverage-gap" ? NOC.warn : NOC.success }}>
                      {skill.maturityScore}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-5">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase" style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}>
                    {selected.name}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold" style={{ color: NOC.ink }}>
                    {selected.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: NOC.muted }}>
                    {selected.description}
                  </p>
                </div>
                <StatusPill status={selected.reviewStatus} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Owner" value={selected.owner} />
                <Metric label="Maturity" value={`${selected.maturityScore}%`} />
                <Metric label="Times used" value={selected.usageCount > 0 ? `${selected.usageCount}×` : "not tracked"} />
                <Metric label="Last activity" value={formatDate(selected.lastActivityAt)} />
              </div>

              {selected.path ? (
                <div>
                  <p className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
                    Source path
                  </p>
                  <p className="mt-1 truncate text-xs" style={{ color: NOC.muted, fontFamily: NOC_FONT_MONO }}>
                    {selected.path}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                {STAGES.map((stage, index) => {
                  const active = stage.id === selected.stage;
                  return (
                    <div
                      key={stage.id}
                      className="border p-3"
                      style={{
                        background: active ? NOC.peach : NOC.fog,
                        borderColor: active ? NOC.terra : NOC.rule,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
                          0{index + 1}
                        </span>
                        {active ? <Check size={15} color={NOC.terra} /> : null}
                      </div>
                      <strong className="mt-2 block text-sm" style={{ color: NOC.ink }}>
                        {stage.title}
                      </strong>
                      <p className="mt-1 text-xs leading-5" style={{ color: NOC.muted }}>
                        {stage.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
                    Current content
                  </p>
                  {selected.draftBody && selected.draftBody !== selected.bodyPreview ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: NOC.peach, color: NOC.terra, fontFamily: NOC_FONT_MONO }}>
                      edit proposed
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 max-h-48 overflow-auto border p-4 text-sm leading-6" style={{ borderColor: NOC.rule, background: NOC.fog, color: NOC.muted }}>
                  {selected.bodyPreview || "No source preview available yet."}
                </div>
              </div>

              {selected.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selected.tags.map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </Card>

        <SkillReviewDesk key={selected?.name ?? "empty"} selected={selected} />
      </div>
    </div>
  );
}

function SkillReviewDesk({ selected }: { selected: SkillWorkflowItem | null }) {
  const [notes, setNotes] = useState(selected?.reviewNotes ?? "");
  const [draftBody, setDraftBody] = useState(selected?.draftBody || "");
  const [changeReason, setChangeReason] = useState(selected?.changeReason ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const reviewMutation = useUpdateSkillReviewMutation();

  const hasDiff = draftBody.trim() && draftBody.trim() !== (selected?.bodyPreview ?? "").trim();

  async function runReviewAction(action: "save-draft" | "request-changes" | "approve-general" | "promote-enterprise") {
    if (!selected) return;
    try {
      await reviewMutation.mutateAsync({
        skillName: selected.name,
        action,
        notes,
        draftBody,
        changeReason,
      });
      setNotice(actionNotice(action));
    } catch (err) {
      // reviewMutation.error surfaces to the UI via isError; clear stale notice
      setNotice("Error: " + (err instanceof Error ? err.message : "Review update failed"));
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase" style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}>
            Review desk
          </p>
          <h3 className="mt-1 text-lg font-semibold" style={{ color: NOC.ink }}>
            Edit and approve
          </h3>
        </div>
        <Edit3 size={18} color={NOC.terra} />
      </div>

      <label className="block">
        <span className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
          Why this change?
        </span>
        <textarea
          aria-label="Reason for this change"
          value={changeReason}
          onChange={(event) => setChangeReason(event.target.value)}
          className="mt-2 min-h-16 w-full resize-y border p-3 text-sm outline-none"
          style={{ borderColor: NOC.rule, color: NOC.ink, background: NOC.paper }}
          placeholder="Why is this edit recommended? What pattern or failure triggered it?"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
          Review notes
        </span>
        <textarea
          aria-label="Skill review notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-2 min-h-20 w-full resize-y border p-3 text-sm outline-none"
          style={{ borderColor: NOC.rule, color: NOC.ink, background: NOC.paper }}
          placeholder="What must change before this skill is reusable?"
        />
      </label>

      <div className="block">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
            Proposed edit draft
          </span>
          {hasDiff ? (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: NOC.peach, color: NOC.terra, fontFamily: NOC_FONT_MONO }}>
              differs from current
            </span>
          ) : null}
        </div>
        <textarea
          aria-label="Skill edit draft"
          value={draftBody}
          onChange={(event) => setDraftBody(event.target.value)}
          className="mt-2 min-h-64 w-full resize-y border p-3 text-sm leading-6 outline-none"
          style={{ borderColor: hasDiff ? NOC.terra : NOC.rule, color: NOC.ink, background: NOC.paper }}
          placeholder="Paste the full revised skill here. Leave blank to approve current content as-is."
        />
        {!draftBody && selected?.bodyPreview ? (
          <button
            type="button"
            className="mt-1 text-xs underline"
            style={{ color: NOC.soft }}
            onClick={() => setDraftBody(selected.bodyPreview)}
          >
            Start from current content
          </button>
        ) : null}
      </div>

      {reviewMutation.isError ? (
        <p className="text-sm" style={{ color: NOC.terra }}>
          {reviewMutation.error instanceof Error ? reviewMutation.error.message : "Review update failed."}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm" style={{ color: NOC.success }}>
          {notice}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Btn variant="ghost" disabled={!selected || reviewMutation.isPending} onClick={() => runReviewAction("save-draft")}>
          <ClipboardCheck size={15} /> Save draft
        </Btn>
        <Btn variant="flat" disabled={!selected || reviewMutation.isPending} onClick={() => runReviewAction("request-changes")}>
          Request changes
        </Btn>
        <Btn variant="terra" disabled={!selected || reviewMutation.isPending} onClick={() => runReviewAction("approve-general")}>
          <Check size={15} /> Approve general
        </Btn>
        <Btn variant="ink" disabled={!selected || reviewMutation.isPending} onClick={() => runReviewAction("promote-enterprise")}>
          <ShieldCheck size={15} /> Promote enterprise
        </Btn>
      </div>
    </Card>
  );
}

function StatusPill({ status }: { status: SkillReviewStatus }) {
  const tone =
    status === "enterprise-ready" || status === "approved"
      ? "success"
      : status === "changes-requested" || status === "in-review"
        ? "warn"
        : "neutral";
  return <Pill tone={tone}>{STATUS_COPY[status]}</Pill>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-3" style={{ borderColor: NOC.rule, background: NOC.paper }}>
      <p className="text-[11px] font-bold uppercase" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold" style={{ color: NOC.ink }}>
        {value}
      </p>
    </div>
  );
}

function stageColor(stage: SkillWorkflowStage) {
  if (stage === "enterprise") return NOC.success;
  if (stage === "general") return NOC.info;
  return NOC.terra;
}

function stageLabel(stage: SkillWorkflowStage) {
  return STAGES.find((item) => item.id === stage)?.title ?? stage;
}

function formatDate(value: string | null) {
  if (!value) return "not recorded";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  );
}

function actionNotice(action: "save-draft" | "request-changes" | "approve-general" | "promote-enterprise") {
  if (action === "request-changes") return "Changes requested and saved.";
  if (action === "approve-general") return "Skill approved for general use.";
  if (action === "promote-enterprise") return "Skill promoted to enterprise review.";
  return "Draft saved.";
}
