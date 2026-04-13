// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NodeDetailPanel } from "../node-detail-panel";

// Mock framer-motion to avoid animation complexities in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useSkills from api-client
vi.mock("@/lib/api-client", () => ({
  useSkills: () => ({ data: null }),
}));

// Mock SkillHeatmap to avoid complex rendering
vi.mock("@/components/skill-heatmap", () => ({
  SkillHeatmap: () => <div data-testid="skill-heatmap">heatmap</div>,
}));

// Mock @tanstack/react-query (pulled in transitively)
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
  QueryClient: class {},
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

interface Event {
  id: string;
  timestamp: string;
  node: string;
  type: "request" | "knowledge" | "memory" | "error" | "apo";
  message: string;
  severity: "info" | "warn" | "error";
}

function makeEvent(overrides: Partial<Event> & { node: string }): Event {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    type: "knowledge",
    severity: "info",
    message: "test event message",
    ...overrides,
  };
}

const defaultProps = {
  nodeId: "notebooks" as string | null,
  nodeLabel: "Notebooks",
  nodeIcon: "📓",
  nodeStats: {},
  events: [] as Event[],
  onClose: vi.fn(),
};

beforeEach(() => {
  // Mock fetch to return a never-resolving promise (avoid state updates in tests)
  vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
  vi.spyOn(AbortController.prototype, "abort");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NodeDetailPanel", () => {
  // T1: 10-cap — given 15 events, renders exactly 10 rows
  it("T1: renders at most 10 event rows even when 15 events provided", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ node: "notebooks", id: `e-${i}`, message: `mem0 event ${i}` })
    );
    render(<NodeDetailPanel {...defaultProps} nodeId="notebooks" events={events} />);
    const rows = screen.getAllByTestId("node-event");
    expect(rows).toHaveLength(10);
  });

  // T2: sparse indicator for qdrant with no matching events
  it("T2: shows limited-activity-data indicator for sparse node (qdrant) with no events", () => {
    render(<NodeDetailPanel {...defaultProps} nodeId="qdrant" events={[]} />);
    const indicator = screen.getByLabelText("limited-activity-data");
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain("Limited activity data");
  });

  // T3: well-mapped node with no events → generic empty message, NOT sparse indicator
  it("T3: shows generic empty message for well-mapped node (notebooks) with no events", () => {
    render(<NodeDetailPanel {...defaultProps} nodeId="notebooks" events={[]} />);
    expect(screen.getByText("No recent activity for this node")).toBeTruthy();
    expect(screen.queryByLabelText("limited-activity-data")).toBeNull();
  });

  // T4: keyword fan-out for qdrant — event with qdrant in message should show
  it("T4: shows events keyword-matched to qdrant even though event.node is notebooks", () => {
    const events = [
      makeEvent({ node: "notebooks", message: "qdrant vector store updated" }),
    ];
    render(<NodeDetailPanel {...defaultProps} nodeId="qdrant" events={events} />);
    const rows = screen.getAllByTestId("node-event");
    expect(rows).toHaveLength(1);
    // Should NOT show sparse indicator since we have events
    expect(screen.queryByLabelText("limited-activity-data")).toBeNull();
  });

  // T5: AbortController.abort() is called on unmount
  it("T5: calls AbortController.abort() when panel unmounts", () => {
    const { unmount } = render(
      <NodeDetailPanel {...defaultProps} nodeId="notebooks" events={[]} />
    );
    unmount();
    expect(AbortController.prototype.abort).toHaveBeenCalled();
  });

  // T6: AbortController.abort() is called when nodeId changes
  it("T6: calls AbortController.abort() when nodeId changes", () => {
    const { rerender } = render(
      <NodeDetailPanel {...defaultProps} nodeId="notebooks" events={[]} />
    );
    vi.mocked(AbortController.prototype.abort).mockClear();
    rerender(
      <NodeDetailPanel {...defaultProps} nodeId="librarian" events={[]} />
    );
    expect(AbortController.prototype.abort).toHaveBeenCalled();
  });

  // T7: AbortError in catch handler does not trigger state update
  // Approach: mock fetch to immediately reject with AbortError, render, assert no
  // "No recent activity" regression (component should be in stable state)
  it("T7: handles AbortError in fetch catch without crashing or bad state updates", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.spyOn(global, "fetch").mockRejectedValue(abortError);

    // Should render without throwing
    expect(() => {
      render(
        <NodeDetailPanel {...defaultProps} nodeId="notebooks" events={[]} />
      );
    }).not.toThrow();

    // Wait a tick for the rejected promise to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    // Panel should still be rendered and not show any error UI from the AbortError
    expect(screen.getByText("No recent activity for this node")).toBeTruthy();
  });
});
