import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateDecision = vi.fn();
const editHilMutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  useOrchestrationHil: vi.fn(),
  useResolveOrchestrationHilMutation: vi.fn(() => ({ mutate: mutateDecision, isPending: false })),
  useEditOrchestrationHilMutation: vi.fn(() => ({ mutate: editHilMutate, isPending: false })),
}));

import { OrchestrationHilPanel } from "../orchestration-hil-panel";
import { useOrchestrationHil } from "@/lib/api-client";

const mockUseHil = vi.mocked(useOrchestrationHil);

describe("OrchestrationHilPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseHil.mockReturnValue({
      data: {
        decisions: [
          {
            id: "hil-1",
            runId: "run-1",
            taskSummary: "Deploy production change",
            selectedAgentId: "research-agent",
            correlationId: "corr-1",
            status: "pending",
            createdAt: "2026-05-05T10:00:00.000Z",
          },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useOrchestrationHil>);
  });

  it("renders pending approve/reject decisions and submits approval", () => {
    render(<OrchestrationHilPanel />);

    expect(screen.getByText("Human approvals")).toBeInTheDocument();
    expect(screen.getByText("Deploy production change")).toBeInTheDocument();
    expect(screen.getAllByText("corr-1").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Approve"));

    expect(mutateDecision).toHaveBeenCalledWith({ id: "hil-1", decision: "approve" });

    fireEvent.click(screen.getByText("Reject"));
    expect(mutateDecision).toHaveBeenCalledWith({ id: "hil-1", decision: "reject" });
  });

  it("wires the HIL edit UI into each pending approval before resume", () => {
    render(<OrchestrationHilPanel />);

    expect(screen.getByRole("form", { name: /edit task/i })).toBeInTheDocument();

    const taskSummaryInput = screen.getByLabelText(/task summary/i);
    fireEvent.change(taskSummaryInput, { target: { value: "Deploy production change with rollback note" } });
    fireEvent.click(screen.getByRole("button", { name: /save edit/i }));

    expect(editHilMutate).toHaveBeenCalledWith({
      id: "hil-1",
      patch: { taskSummary: "Deploy production change with rollback note" },
    });
  });

  it("renders loading, error, and empty HIL queue states", () => {
    mockUseHil.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false } as ReturnType<typeof useOrchestrationHil>);
    const { rerender } = render(<OrchestrationHilPanel />);
    expect(screen.getByText(/checking orchestration decisions/i)).toBeInTheDocument();

    mockUseHil.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useOrchestrationHil>);
    rerender(<OrchestrationHilPanel />);
    expect(screen.getByText(/approval queue unavailable/i)).toBeInTheDocument();

    mockUseHil.mockReturnValueOnce({ data: { decisions: [] }, isLoading: false, isError: false } as ReturnType<typeof useOrchestrationHil>);
    rerender(<OrchestrationHilPanel />);
    expect(screen.getByText(/no pending approvals/i)).toBeInTheDocument();
  });
});
