import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const MOCK_AGENTS = [
  { id: "sophia", name: "Sophia", role: "developer", platform: "openclaw", location: "tailscale", host: "h", port: 3100, healthEndpoint: "/health" },
];

const MOCK_DELEGATIONS = [
  {
    task_id: "t1",
    from_agent: "kitchen",
    to_agent: "sophia",
    task_summary: "build the widget",
    priority: 3,
    status: "active",
    created_at: "2026-04-19T10:00:00Z",
    updated_at: "2026-04-19T10:01:00Z",
  },
];

vi.mock("@/lib/api-client", () => ({
  useAgents: () => ({ data: { agents: MOCK_AGENTS }, isLoading: false }),
  useDelegations: () => ({ data: { delegations: MOCK_DELEGATIONS }, isLoading: false }),
  useLineage: () => ({ data: undefined, isLoading: false }),
  useAgentCards: () => ({
    data: {
      cards: [
        {
          name: "Sophia",
          description: "Sophia — developer agent (openclaw)",
          version: "1",
          url: "http://sophia.local:3100",
          capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
          authentication: { schemes: ["none"] },
          skills: [{ id: "code-execute", name: "Code Execution", description: "Write and execute code", tags: ["code"] }],
          extensions: { kitchen: { id: "sophia", platform: "openclaw", location: "tailscale", role: "developer" } },
        },
      ],
      timestamp: "2026-04-19T10:00:00Z",
    },
    isLoading: false,
  }),
}));

import { DispatchPanel } from "../dispatch-panel";
import { AgentCardsPanel } from "../agent-cards-panel";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("DispatchPanel", () => {
  it("renders dispatch form with agent selector", () => {
    wrap(<DispatchPanel />);
    expect(screen.getAllByText(/dispatch/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  it("shows delegation list with existing delegations", () => {
    wrap(<DispatchPanel />);
    expect(screen.getAllByText("build the widget").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sophia").length).toBeGreaterThan(0);
  });

  it("shows status badge for each delegation", () => {
    wrap(<DispatchPanel />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("submit button is disabled when form is empty", () => {
    wrap(<DispatchPanel />);
    const btn = screen.getByRole("button", { name: /dispatch/i });
    expect(btn).toBeDisabled();
  });
});

describe("AgentCardsPanel", () => {
  it("renders agent cards", () => {
    wrap(<AgentCardsPanel />);
    expect(screen.getByText("Sophia")).toBeInTheDocument();
    expect(screen.getByText("Code Execution")).toBeInTheDocument();
  });
});
