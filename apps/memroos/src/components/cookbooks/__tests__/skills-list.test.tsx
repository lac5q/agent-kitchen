import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    useUpdateSkillReviewMutation: vi.fn(),
  };
});

import { SkillsList } from "@/components/cookbooks/skills-list";
import { useUpdateSkillReviewMutation, type SkillWorkflowItem } from "@/lib/api-client";

const mockUseUpdateSkillReviewMutation = vi.mocked(useUpdateSkillReviewMutation);
const mutateAsync = vi.fn();

const skillDetails: SkillWorkflowItem[] = [
  {
    name: "agent-standup",
    title: "Agent Standup",
    path: "/tmp/agent-standup/SKILL.md",
    description: "Collect yesterday, today, and blockers from room participants.",
    bodyPreview: "Use when operators need a structured fifteen minute standup.",
    stage: "agent-limited",
    reviewStatus: "in-review",
    reviewNotes: "",
    draftBody: "",
    owner: "ops",
    tags: ["workflow"],
    health: "ready",
    lastActivityAt: "2026-05-17T10:00:00.000Z",
    maturityScore: 58,
    updatedAt: null,
    approvedAt: null,
  },
  {
    name: "enterprise-review",
    title: "Enterprise Review",
    path: "/tmp/enterprise-review/SKILL.md",
    description: "Approve governed skills for broad enterprise use.",
    bodyPreview: "Use when a skill is ready for policy and audit review.",
    stage: "enterprise",
    reviewStatus: "enterprise-ready",
    reviewNotes: "Ready.",
    draftBody: "Approved body.",
    owner: "admin",
    tags: ["governance"],
    health: "ready",
    lastActivityAt: null,
    maturityScore: 92,
    updatedAt: "2026-05-17T12:00:00.000Z",
    approvedAt: "2026-05-17T12:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ ok: true });
  mockUseUpdateSkillReviewMutation.mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useUpdateSkillReviewMutation>);
});

describe("SkillsList", () => {
  it("renders the review workflow and persists approval actions", async () => {
    render(
      <SkillsList
        totalSkills={2}
        allSkills={["agent-standup", "enterprise-review"]}
        skillDetails={skillDetails}
        coverageGaps={[]}
      />
    );

    expect(screen.getByText("Move skills from local know-how to enterprise workflow.")).toBeTruthy();
    expect(screen.getAllByText("Agent-Limited").length).toBeGreaterThan(0);
    expect(screen.getAllByText("General Skill").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enterprise Skill").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Skill review notes"), {
      target: { value: "Looks reusable for the standup room." },
    });
    fireEvent.change(screen.getByLabelText("Skill edit draft"), {
      target: { value: "Draft with clear operator procedure." },
    });
    fireEvent.click(screen.getByRole("button", { name: /approve general/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        skillName: "agent-standup",
        action: "approve-general",
        notes: "Looks reusable for the standup room.",
        draftBody: "Draft with clear operator procedure.",
        changeReason: "",
      });
    });
    expect(screen.getByText("Skill approved for general use.")).toBeTruthy();
  });

  it("renders an empty state when no skill names are available", () => {
    render(<SkillsList totalSkills={0} allSkills={[]} coverageGaps={[]} />);

    expect(screen.getByText("No skills found.")).toBeTruthy();
  });

  it("builds fallback items from names and marks coverage as untracked", () => {
    render(
      <SkillsList
        totalSkills={2}
        allSkills={["gap-skill", "ready-skill"]}
        coverageGaps={["gap-skill"]}
        coverageTelemetryStatus="untracked"
      />
    );

    expect(screen.getByText("coverage untracked")).toBeTruthy();
    expect(screen.getAllByText("Skill metadata is still being indexed.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("35%").length).toBeGreaterThan(0);
  });

  it("can start from current content and save a draft", async () => {
    render(
      <SkillsList
        totalSkills={2}
        allSkills={["agent-standup", "enterprise-review"]}
        skillDetails={skillDetails}
        coverageGaps={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /start from current content/i }));
    expect(screen.getByLabelText("Skill edit draft")).toHaveValue(skillDetails[0].bodyPreview);
    fireEvent.change(screen.getByLabelText("Reason for this change"), {
      target: { value: "Clarify the repeatable workflow." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        skillName: "agent-standup",
        action: "save-draft",
        notes: "",
        draftBody: skillDetails[0].bodyPreview,
        changeReason: "Clarify the repeatable workflow.",
      });
    });
    expect(screen.getByText("Draft saved.")).toBeTruthy();
  });

  it("surfaces mutation failures and enterprise promotion notices", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("review service unavailable"));
    render(
      <SkillsList
        totalSkills={2}
        allSkills={["agent-standup", "enterprise-review"]}
        skillDetails={skillDetails}
        coverageGaps={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /request changes/i }));
    await waitFor(() => {
      expect(screen.getByText("Error: review service unavailable")).toBeTruthy();
    });

    mutateAsync.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: /promote enterprise/i }));
    await waitFor(() => {
      expect(screen.getByText("Skill promoted to enterprise review.")).toBeTruthy();
    });
  });
});
