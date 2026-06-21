import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  useApo: () => ({
    data: {
      proposals: [
        {
          id: "APO_PROPOSAL_ceo_ceo_20260505_120000.md",
          filename: "APO_PROPOSAL_ceo_ceo_20260505_120000.md",
          skill: "ceo",
          subsystem: "ceo",
          timestamp: "2026-05-05T12:00:00Z",
          content: "# Agent-Lightning APO Proposal\n\nProposal body",
          status: "archived",
        },
      ],
      stats: {
        lastRun: "2026-05-05T12:00:00Z",
        totalProposals: 1,
        pendingProposals: 0,
        approvedProposals: 0,
        archivedProposals: 1,
        recentLogLines: [],
      },
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/apo/cycle-status", () => ({
  CycleStatus: () => <div>Cycle status</div>,
}));

vi.mock("@/components/apo/proposal-card", () => ({
  ProposalCard: ({ proposal }: { proposal: { skill: string } }) => <div>{proposal.skill}</div>,
}));

vi.mock("@/components/apo/proposal-detail", () => ({
  ProposalDetail: () => null,
}));

vi.mock("@/components/apo/log-viewer", () => ({
  LogViewer: () => <div>Log viewer</div>,
}));

vi.mock("@/components/ui/info-tip", () => ({
  InfoTip: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/shared/ui", () => ({
  PageHeader: ({ eyebrow, title, hint }: { eyebrow: string; title: React.ReactNode; hint: string }) => (
    <header>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{hint}</p>
    </header>
  ),
}));

import ApoPage from "../page";

describe("ApoPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/apo");
  });

  it("opens the pending tab from query string and explains an empty queue", async () => {
    window.history.replaceState({}, "", "/apo?tab=pending&source=flow");

    render(<ApoPage />);

    expect(await screen.findByText(/no proposals in this view/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pending/i })).toHaveStyle({ color: "#7a2a1e" });
  });

  it("still lets operators switch tabs manually", async () => {
    window.history.replaceState({}, "", "/apo?tab=pending&source=flow");

    render(<ApoPage />);
    await screen.findByText(/no proposals in this view/i);
    fireEvent.click(screen.getByRole("button", { name: /archived/i }));

    expect(screen.getByText("ceo")).toBeInTheDocument();
  });

  it("explains why archived proposals do not show approval buttons", async () => {
    render(<ApoPage />);

    expect(await screen.findByText(/approval buttons only appear on pending proposals/i)).toBeInTheDocument();
  });
});
