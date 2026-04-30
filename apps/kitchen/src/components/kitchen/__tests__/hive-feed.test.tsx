import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HiveFeed } from "../hive-feed";

// Mock the api-client module to control useHiveFeed return values
vi.mock("@/lib/api-client", () => ({
  useHiveFeed: vi.fn(),
}));

import { useHiveFeed } from "@/lib/api-client";

const mockUseHiveFeed = useHiveFeed as ReturnType<typeof vi.fn>;

const sampleActions = [
  {
    id: 1,
    agent_id: "claude",
    action_type: "continue",
    summary: "Continued processing task",
    artifacts: null,
    timestamp: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
  },
  {
    id: 2,
    agent_id: "paperclip",
    action_type: "loop",
    summary: "Looping over pending items",
    artifacts: null,
    timestamp: new Date(Date.now() - 3_600_000).toISOString(), // 1 hr ago
  },
  {
    id: 3,
    agent_id: "hermes",
    action_type: "checkpoint",
    summary: "Checkpoint reached",
    artifacts: null,
    timestamp: new Date(Date.now() - 10_000).toISOString(), // just now
  },
  {
    id: 4,
    agent_id: "gwen",
    action_type: "trigger",
    summary: "Triggered downstream agent",
    artifacts: null,
    timestamp: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
  },
  {
    id: 5,
    agent_id: "codex",
    action_type: "stop",
    summary: "Agent stopped",
    artifacts: null,
    timestamp: new Date(Date.now() - 7_200_000).toISOString(), // 2 hr ago
  },
  {
    id: 6,
    agent_id: "hermes",
    action_type: "error",
    summary: "Encountered an error",
    artifacts: null,
    timestamp: new Date(Date.now() - 300_000).toISOString(), // 5 min ago
  },
];

describe("HiveFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1 (DASH-02): renders action rows with agent_id, action_type, summary, and timestamp", () => {
    mockUseHiveFeed.mockReturnValue({
      data: { actions: sampleActions, timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<HiveFeed />);

    // Check agent_ids are visible (hermes appears twice — use getAllByText)
    expect(screen.getByText("claude")).toBeInTheDocument();
    expect(screen.getAllByText("hermes").length).toBeGreaterThan(0);

    // Check action_types are visible (as chips)
    expect(screen.getByText("continue")).toBeInTheDocument();
    expect(screen.getByText("loop")).toBeInTheDocument();

    // Check summaries are visible
    expect(screen.getByText("Continued processing task")).toBeInTheDocument();
    expect(screen.getByText("Looping over pending items")).toBeInTheDocument();

    // Check timestamps are visible (relative time format)
    expect(screen.getByText("1m ago")).toBeInTheDocument();
  });

  it("Test 2 (DASH-02): empty actions array renders 'No hive activity yet' message", () => {
    mockUseHiveFeed.mockReturnValue({
      data: { actions: [], timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<HiveFeed />);

    expect(screen.getByText("No hive activity yet.")).toBeInTheDocument();
  });

  it("Test 3 (DASH-02): loading state renders a spinner element", () => {
    mockUseHiveFeed.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<HiveFeed />);

    // Spinner has animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("Test 4 (DASH-02): each action_type gets a color-coded chip", () => {
    mockUseHiveFeed.mockReturnValue({
      data: { actions: sampleActions, timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<HiveFeed />);

    // All action types should be visible as chips
    expect(screen.getByText("continue")).toBeInTheDocument();
    expect(screen.getByText("loop")).toBeInTheDocument();
    expect(screen.getByText("checkpoint")).toBeInTheDocument();
    expect(screen.getByText("trigger")).toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();

    // Color chips: continue should have sky class, loop should have violet class
    const continueChip = screen.getByText("continue");
    expect(continueChip.className).toMatch(/sky/);

    const loopChip = screen.getByText("loop");
    expect(loopChip.className).toMatch(/violet/);

    const checkpointChip = screen.getByText("checkpoint");
    expect(checkpointChip.className).toMatch(/emerald/);

    const triggerChip = screen.getByText("trigger");
    expect(triggerChip.className).toMatch(/amber/);

    const stopChip = screen.getByText("stop");
    expect(stopChip.className).toMatch(/slate/);

    const errorChip = screen.getByText("error");
    expect(errorChip.className).toMatch(/rose/);
  });

  it("Test 5 (HIVE-05): an action with agent_id='paperclip' renders with that label visible", () => {
    mockUseHiveFeed.mockReturnValue({
      data: {
        actions: [
          {
            id: 99,
            agent_id: "paperclip",
            action_type: "continue",
            summary: "Paperclip is doing its thing",
            artifacts: null,
            timestamp: new Date(Date.now() - 30_000).toISOString(),
          },
        ],
        timestamp: new Date().toISOString(),
      },
      isLoading: false,
    });

    render(<HiveFeed />);

    expect(screen.getByText("paperclip")).toBeInTheDocument();
    expect(screen.getByText("Paperclip is doing its thing")).toBeInTheDocument();
  });
});
