/**
 * paperclip-fleet-panel.test.tsx
 *
 * RTL tests for the PaperclipFleetPanel component.
 * Tests are written RED-first; the component does not exist yet.
 *
 * Coverage:
 *   Test 1 (DASH-03): per-agent rows with name, autonomy badge, active task, last heartbeat
 *   Test 2 (PAPER-03): autonomy badge vocabulary — Interactive, Autonomous, Continuous, Hybrid
 *   Test 3 (PAPER-04): recovery rows with sessionId, completedSteps count, resumeFrom, and status
 *   Test 4 (PAPER-02): dispatch form POSTs to /api/paperclip with taskSummary + requestedBy
 *   Test 5 (PAPER-02): successful dispatch shows success state and clears the input
 *   Test 6 (PAPER-02): failed dispatch surfaces an inline error message
 *   Test 7: loading state renders a spinner; null fleet renders empty state without crash
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, afterEach } from "vitest";
import { PaperclipFleetPanel } from "../paperclip-fleet-panel";
import type { PaperclipFleetResponse } from "@/types";

// ── Fixture ────────────────────────────────────────────────────────────────

const FLEET_FIXTURE: PaperclipFleetResponse = {
  summary: {
    fleetStatus: "active",
    totalAgents: 3,
    activeAgents: 2,
    activeTasks: 1,
    pausedRecoveries: 1,
    autonomyMix: { Interactive: 1, Autonomous: 1, Continuous: 1, Hybrid: 0 },
    lastHeartbeat: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  },
  agents: [
    {
      id: "agent-1",
      name: "Alpha",
      status: "active",
      autonomyMode: "Interactive",
      activeTask: "Processing user request",
      lastHeartbeat: new Date(Date.now() - 30000).toISOString(), // 30s ago
    },
    {
      id: "agent-2",
      name: "Beta",
      status: "active",
      autonomyMode: "Autonomous",
      activeTask: null,
      lastHeartbeat: new Date(Date.now() - 120000).toISOString(), // 2 min ago
    },
    {
      id: "agent-3",
      name: "Gamma",
      status: "dormant",
      autonomyMode: "Continuous",
      activeTask: null,
      lastHeartbeat: null,
    },
  ],
  operations: [
    {
      taskId: "task-abc-123-xyz",
      sessionId: "sess-xyz-789-abc",
      status: "active",
      summary: "Ongoing ingestion task",
      resumeFrom: null,
      completedSteps: [],
      updatedAt: new Date().toISOString(),
    },
    {
      taskId: "task-def-456-uvw",
      sessionId: "sess-uvw-321-def",
      status: "paused",
      summary: "Paused analysis task",
      resumeFrom: "step-analysis",
      completedSteps: ["init", "fetch", "parse"],
      updatedAt: new Date().toISOString(),
    },
  ],
  timestamp: new Date().toISOString(),
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PaperclipFleetPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Test 1 (DASH-03): renders per-agent rows with name, autonomy badge, active task, and last heartbeat", () => {
    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    // Agent names are visible
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();

    // Active task is shown for Alpha
    expect(screen.getByText("Processing user request")).toBeInTheDocument();

    // Null active task shows "idle" fallback for Beta and Gamma
    const idleLabels = screen.getAllByText(/^idle$/i);
    expect(idleLabels.length).toBeGreaterThanOrEqual(1);

    // Heartbeat text is shown (at least one "ago" reference or "never")
    const heartbeatText = screen.getAllByText(/ago|never/i);
    expect(heartbeatText.length).toBeGreaterThanOrEqual(1);
  });

  it("Test 2 (PAPER-03): autonomy badges render the exact vocabulary: Interactive, Autonomous, Continuous, Hybrid", () => {
    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    // Each agent's autonomy mode is shown as a badge
    expect(screen.getByText("Interactive")).toBeInTheDocument();
    expect(screen.getByText("Autonomous")).toBeInTheDocument();
    expect(screen.getByText("Continuous")).toBeInTheDocument();

    // Hybrid should NOT appear in this fixture
    expect(screen.queryByText("Hybrid")).not.toBeInTheDocument();
    // No unknown/invalid values
    expect(screen.queryByText(/unknown|invalid/i)).not.toBeInTheDocument();
  });

  it("Test 3 (PAPER-04): recovery rows render sessionId, completedSteps count, resumeFrom, and status", () => {
    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    // Session IDs are visible (truncated or full) — use getAllByText to handle multiple matches
    const xyzMatches = screen.getAllByText(/sess-xyz/);
    expect(xyzMatches.length).toBeGreaterThanOrEqual(1);

    const uvwMatches = screen.getAllByText(/sess-uvw/);
    expect(uvwMatches.length).toBeGreaterThanOrEqual(1);

    // completedSteps count for the paused operation (3 steps) — "3 steps completed"
    expect(screen.getByText(/3 step/)).toBeInTheDocument();

    // resumeFrom for the paused operation
    expect(screen.getByText(/step-analysis/)).toBeInTheDocument();

    // status chip for paused operation
    expect(screen.getAllByText(/paused/i).length).toBeGreaterThanOrEqual(1);
  });

  it("Test 4 (PAPER-02): submitting the dispatch form POSTs to /api/paperclip with taskSummary and requestedBy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, taskId: "task-new-001", sessionId: "sess-new-001" }),
    });
    global.fetch = fetchMock;

    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    // Find the dispatch input and fill it
    const input = screen.getByPlaceholderText(/task|dispatch/i);
    fireEvent.change(input, { target: { value: "Process new batch" } });

    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /dispatch/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/paperclip",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Process new batch"),
        })
      );
    });

    // Verify requestedBy: "dashboard" is in the body
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.requestedBy).toBe("dashboard");
    expect(callBody.taskSummary).toBe("Process new batch");
  });

  it("Test 5 (PAPER-02): successful dispatch shows success state and clears the input", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, taskId: "task-success-001", sessionId: "sess-success-001" }),
    });

    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    const input = screen.getByPlaceholderText(/task|dispatch/i);
    fireEvent.change(input, { target: { value: "My task" } });
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    // Success message is shown (contains taskId)
    await waitFor(() => {
      expect(screen.getByText(/task-success-001/i)).toBeInTheDocument();
    });

    // Input is cleared
    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("Test 6 (PAPER-02): failed dispatch surfaces an inline error message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Upstream unavailable" }),
    });

    render(<PaperclipFleetPanel fleet={FLEET_FIXTURE} isLoading={false} />);

    const input = screen.getByPlaceholderText(/task|dispatch/i);
    fireEvent.change(input, { target: { value: "Failing task" } });
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    await waitFor(() => {
      expect(screen.getByText(/error:|upstream unavailable/i)).toBeInTheDocument();
    });
  });

  it("Test 7: loading state renders a spinner; null fleet renders empty state without crash", () => {
    const { rerender } = render(<PaperclipFleetPanel fleet={null} isLoading={true} />);

    // Loading state: spinner is rendered
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();

    // Null fleet + not loading: empty/offline state
    rerender(<PaperclipFleetPanel fleet={null} isLoading={false} />);
    expect(screen.getByText(/offline|empty|no fleet/i)).toBeInTheDocument();
  });
});
