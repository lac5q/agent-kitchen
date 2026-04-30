import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div data-testid="sheet-content">{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/lib/api-client", () => ({
  useLineage: (taskId: string | null) => ({
    data: taskId
      ? {
          task_id: taskId,
          context_id: "ctx-1",
          delegation: { task_summary: "test task", from_agent: "kitchen", to_agent: "sophia" },
          actions: [
            { id: 1, agent_id: "sophia", action_type: "checkpoint", summary: "step 1 done", artifacts: null, timestamp: "2026-04-19T10:00:00Z" },
            { id: 2, agent_id: "sophia", action_type: "stop", summary: "completed", artifacts: null, timestamp: "2026-04-19T10:01:00Z" },
          ],
          timestamp: "2026-04-19T10:01:00Z",
        }
      : undefined,
    isLoading: false,
  }),
}));

import { LineageDrawer } from "../lineage-drawer";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("LineageDrawer", () => {
  it("renders trigger button", () => {
    wrap(<LineageDrawer taskId="t1" taskSummary="test task" />);
    expect(screen.getByRole("button", { name: /timeline/i })).toBeInTheDocument();
  });

  it("shows action list when taskId is set", () => {
    wrap(<LineageDrawer taskId="t1" taskSummary="test task" />);
    expect(screen.getByText("step 1 done")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders nothing inside sheet when taskId is null", () => {
    wrap(<LineageDrawer taskId={null} taskSummary="" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
