import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apoMock = vi.hoisted(() => ({
  result: {
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
  },
}));

vi.mock("@/lib/api-client", () => ({
  useApo: () => apoMock.result,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/apo/cycle-status", () => ({
  CycleStatus: () => <div>Cycle status</div>,
}));

vi.mock("@/components/apo/proposal-card", () => ({
  ProposalCard: ({ proposal, onClick }: { proposal: { skill: string }; onClick: (proposal: unknown) => void }) => (
    <button type="button" onClick={() => onClick(proposal)}>
      {proposal.skill}
    </button>
  ),
}));

vi.mock("@/components/apo/proposal-detail", () => ({
  ProposalDetail: ({ open, proposal }: { open: boolean; proposal: { skill?: string } | null }) => (
    <div data-testid="proposal-detail" data-open={String(open)}>
      {proposal?.skill ?? "none"}
    </div>
  ),
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
    apoMock.result = {
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
    };
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

  it("renders loading, error, and empty proposal states", async () => {
    apoMock.result = { data: undefined, isLoading: true, error: null };
    const { rerender } = render(<ApoPage />);
    expect(await screen.findByText(/loading proposals/i)).toBeInTheDocument();

    apoMock.result = { data: undefined, isLoading: false, error: new Error("APO unavailable") };
    rerender(<ApoPage />);
    expect(await screen.findByText(/failed to load proposals: Error: APO unavailable/i)).toBeInTheDocument();

    apoMock.result = {
      data: {
        proposals: [],
        stats: {
          lastRun: null,
          totalProposals: 0,
          pendingProposals: 0,
          approvedProposals: 0,
          archivedProposals: 0,
          recentLogLines: [],
        },
      },
      isLoading: false,
      error: null,
    };
    rerender(<ApoPage />);
    expect(await screen.findByText(/No APO proposal files were found/i)).toBeInTheDocument();
  });

  it("sorts pending before approved and opens the detail drawer", async () => {
    apoMock.result = {
      data: {
        proposals: [
          {
            id: "approved",
            filename: "approved.md",
            skill: "approved-skill",
            subsystem: "ops",
            timestamp: "2026-05-05T10:00:00Z",
            content: "approved",
            status: "approved",
          },
          {
            id: "pending",
            filename: "pending.md",
            skill: "pending-skill",
            subsystem: "ops",
            timestamp: "2026-05-05T09:00:00Z",
            content: "pending",
            status: "pending",
          },
        ],
        stats: {
          lastRun: "2026-05-05T12:00:00Z",
          totalProposals: 2,
          pendingProposals: 1,
          approvedProposals: 1,
          archivedProposals: 0,
          recentLogLines: ["ran"],
        },
      },
      isLoading: false,
      error: null,
    };
    render(<ApoPage />);

    const cards = await screen.findAllByRole("button", { name: /skill/i });
    expect(cards.map((card) => card.textContent)).toEqual(["pending-skill", "approved-skill"]);
    fireEvent.click(cards[0]);
    expect(screen.getByTestId("proposal-detail")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("proposal-detail")).toHaveTextContent("pending-skill");
  });
});
