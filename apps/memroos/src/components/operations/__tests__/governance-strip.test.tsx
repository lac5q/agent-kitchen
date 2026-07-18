import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  useAuditLog: vi.fn(),
  useOrchestrationHil: vi.fn(),
  useSecurityReport: vi.fn(),
}));

vi.mock("@/lib/api-client", () => api);

import { GovernanceStrip } from "../governance-strip";

describe("GovernanceStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.useSecurityReport.mockReturnValue({
      data: {
        summary: { blockedAttempts: 2, securityEvents: 5 },
      },
      isLoading: false,
      isError: false,
    });
    api.useOrchestrationHil.mockReturnValue({
      data: { decisions: [{ id: "hil-1" }] },
      isLoading: false,
      isError: false,
    });
    api.useAuditLog.mockReturnValue({
      data: {
        entries: [
          {
            timestamp: "2026-07-18T10:00:00.000Z",
            action: "policy_denied",
            actor: "agent-alpha",
            target: "memory_write",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders live governance counts and recent audit events with scope disclosure", () => {
    render(<GovernanceStrip filters={{ window: "7d", workspace: "remote" }} />);

    expect(screen.getByText("Governance & trust")).toBeInTheDocument();
    expect(screen.getByText(/window=7d, workspace=remote/)).toBeInTheDocument();
    expect(document.querySelector('[data-gov-row="Blocked attempts"]')?.getAttribute("data-gov-state")).toBe("live");
    expect(document.querySelector('[data-gov-row="HIL approvals"]')?.getAttribute("data-gov-state")).toBe("live");
    expect(document.querySelector('[data-gov-row="Audit lines"]')?.getAttribute("data-gov-state")).toBe("live");
    expect(screen.getByText("policy_denied")).toBeInTheDocument();
    expect(screen.getByText("agent-alpha · memory_write")).toBeInTheDocument();
  });

  it("renders measured-zero and empty event states without fabricating failures", () => {
    api.useSecurityReport.mockReturnValue({
      data: { summary: { blockedAttempts: 0, securityEvents: 0 } },
      isLoading: false,
      isError: false,
    });
    api.useOrchestrationHil.mockReturnValue({
      data: { decisions: [] },
      isLoading: false,
      isError: false,
    });
    api.useAuditLog.mockReturnValue({
      data: { entries: [] },
      isLoading: false,
      isError: false,
    });

    render(<GovernanceStrip />);

    expect(document.querySelector('[data-gov-row="Blocked attempts"]')?.getAttribute("data-gov-state")).toBe("zero");
    expect(document.querySelector('[data-gov-row="HIL approvals"]')?.getAttribute("data-gov-state")).toBe("zero");
    expect(screen.getByText("No recent audit events returned by /api/audit-log.")).toBeInTheDocument();
  });

  it("marks loading and errored sources independently", () => {
    api.useSecurityReport.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    api.useOrchestrationHil.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    api.useAuditLog.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    render(<GovernanceStrip />);

    expect(document.querySelector('[data-gov-row="Blocked attempts"]')?.getAttribute("data-gov-state")).toBe("blocked");
    expect(document.querySelector('[data-gov-row="HIL approvals"]')?.getAttribute("data-gov-state")).toBe("error");
    expect(document.querySelector('[data-gov-row="Audit lines"]')?.getAttribute("data-gov-state")).toBe("unavailable");
    expect(screen.getByText("A governance source failed to load.")).toBeInTheDocument();
  });
});
