import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const api = vi.hoisted(() => ({
  useEscalations: vi.fn(),
  useResolveEscalation: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useEscalations: api.useEscalations,
  useResolveEscalation: api.useResolveEscalation,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/escalations/sla-countdown", () => ({
  SlaCountdown: () => <div data-testid="sla-countdown" />,
}));

import EscalationsPage from "../page";
import type { EscalationWithCountdown } from "@/lib/api-client";

const OPEN_ESCALATION: EscalationWithCountdown = {
  id: "esc-1",
  tenant_id: "tenant-1",
  entity_type: "agent",
  entity_id: "codex-cli-agent",
  escalation_type: "agent_escalate",
  sla_seconds: 3600,
  sla_deadline: new Date(Date.now() + 60_000).toISOString(),
  status: "open",
  assigned_to: "operator",
  opened_by: "system",
  created_at: "2026-07-13T10:00:00.000Z",
  isOverdue: false,
  slaRemainingMs: 60_000,
};

const RESOLVED_ESCALATION: EscalationWithCountdown = {
  ...OPEN_ESCALATION,
  id: "esc-2",
  status: "resolved",
  resolution_note: "Restarted the worker",
  resolved_by: "operator",
  resolved_at: "2026-07-13T11:00:00.000Z",
  slaRemainingMs: 0,
};

const BREACHED_ESCALATION: EscalationWithCountdown = {
  ...OPEN_ESCALATION,
  id: "esc-3",
  status: "sla_breached",
  slaRemainingMs: -1,
  isOverdue: true,
};

const mutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  api.useResolveEscalation.mockReturnValue({
    mutate,
    isError: false,
    error: null,
  });
  api.useEscalations.mockReturnValue({
    data: { escalations: [OPEN_ESCALATION], timestamp: "2026-07-13T12:00:00.000Z" },
    isLoading: false,
    isError: false,
  });
});

describe("EscalationsPage", () => {
  it("renders open escalations and resolves through the modal", () => {
    render(<EscalationsPage />);

    expect(screen.getByText("Escalations")).toBeInTheDocument();
    expect(screen.getByText("codex-cli-agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText(/Assigned to: operator/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.change(screen.getByPlaceholderText(/Describe how this was resolved/i), {
      target: { value: "Cleared queue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mutate).toHaveBeenCalledWith({ id: "esc-1", note: "Cleared queue" });
  });

  it("switches tabs and requests the matching status filter", () => {
    render(<EscalationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Resolved" }));
    expect(api.useEscalations).toHaveBeenLastCalledWith({ status: "resolved", limit: 25 });
  });

  it("shows resolved notes and hides resolve actions for closed items", () => {
    api.useEscalations.mockReturnValue({
      data: { escalations: [RESOLVED_ESCALATION], timestamp: "2026-07-13T12:00:00.000Z" },
      isLoading: false,
      isError: false,
    });

    render(<EscalationsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText(/Note: Restarted the worker/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  it("highlights breached SLAs and shows loading and error states", () => {
    api.useEscalations.mockReturnValue({
      data: { escalations: [BREACHED_ESCALATION], timestamp: "2026-07-13T12:00:00.000Z" },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<EscalationsPage />);
    expect(screen.getByText("SLA breached")).toBeInTheDocument();

    api.useEscalations.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    rerender(<EscalationsPage />);
    expect(screen.getByText(/Loading escalations/i)).toBeInTheDocument();

    api.useEscalations.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    api.useResolveEscalation.mockReturnValue({
      mutate,
      isError: true,
      error: new Error("resolve failed"),
    });
    rerender(<EscalationsPage />);

    expect(screen.getByText(/Failed to load escalations/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to resolve escalation: resolve failed/i)).toBeInTheDocument();
  });

  it("shows an empty-state message for the active tab", () => {
    api.useEscalations.mockReturnValue({
      data: { escalations: [], timestamp: "2026-07-13T12:00:00.000Z" },
      isLoading: false,
      isError: false,
    });

    render(<EscalationsPage />);
    expect(screen.getByText(/No open escalations found/i)).toBeInTheDocument();
  });
});
