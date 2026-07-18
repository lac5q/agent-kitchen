import type React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mutate = vi.fn();

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <div className={className} onClick={onClick}>{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/lib/api-client", () => ({
  useApproveApoProposalMutation: () => ({ mutate, isPending: false, isError: false, error: null }),
}));

import { ProposalCard } from "../proposal-card";

const pendingProposal = {
  id: "APO_PROPOSAL_ceo_ceo_20260505_120000.md",
  filename: "APO_PROPOSAL_ceo_ceo_20260505_120000.md",
  skill: "ceo",
  subsystem: "ceo",
  timestamp: "2026-05-05T12:00:00Z",
  content: "# Agent-Lightning APO Proposal\n\nProposal body",
  status: "pending" as const,
};

describe("ProposalCard", () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it("approves a pending proposal without opening the detail drawer", () => {
    const onClick = vi.fn();
    render(<ProposalCard proposal={pendingProposal} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(mutate).toHaveBeenCalledWith(pendingProposal.id);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows queued tracking details for approved proposals", () => {
    render(
      <ProposalCard
        proposal={{
          ...pendingProposal,
          status: "approved",
          tracking: {
            phase: "queued",
            label: "Queued for worker",
            description: "Approved and waiting for the worker.",
            approvedAt: "2026-05-07T07:28:14.591Z",
            targetPath: "/Users/yourname/.openclaw/skills/ceo/SKILL.md",
            targetKind: "skill",
            executorCli: "qwen",
          },
        }}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByText("Queued for worker")).toBeInTheDocument();
    expect(screen.getByText("executor: qwen")).toBeInTheDocument();
    expect(screen.getByText("target: skill")).toBeInTheDocument();
  });

  it("opens details from the card and falls back to queued tracking for approved proposals", () => {
    const onClick = vi.fn();
    render(<ProposalCard proposal={{ ...pendingProposal, status: "approved" }} onClick={onClick} />);

    fireEvent.click(screen.getAllByText("ceo")[0]);

    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: pendingProposal.id }));
    expect(screen.getByText("Queued for worker")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("does not show approve for archived proposals", () => {
    render(<ProposalCard proposal={{ ...pendingProposal, status: "archived" }} onClick={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Implemented").length).toBeGreaterThan(0);
  });

  it("shows implemented tracking details for archived proposals", () => {
    render(
      <ProposalCard
        proposal={{
          ...pendingProposal,
          status: "archived",
          tracking: {
            phase: "implemented",
            label: "Implemented",
            description: "Applied by the worker and archived for audit.",
            implementedAt: "2026-05-07T07:35:00.000Z",
            targetPath: "/Users/yourname/.openclaw/skills/ceo/SKILL.md",
            targetKind: "skill",
            executorCli: "qwen",
            applied: true,
          },
        }}
        onClick={vi.fn()}
      />
    );

    expect(screen.getAllByText("Implemented").length).toBeGreaterThan(0);
    expect(screen.getByText("applied")).toBeInTheDocument();
  });
});
