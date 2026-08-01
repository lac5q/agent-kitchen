import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredAgent } from "@/types";
import type { LivenessObservation } from "@/lib/agent-liveness";

const mutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  useUpdateAgentDetailsMutation: vi.fn(() => ({
    mutate,
    isPending: false,
  })),
}));

import { AgentRegistryTable, type RegistryAgentRow } from "../agent-registry-table";

const baseAgent = (overrides: Partial<RegisteredAgent> = {}): RegisteredAgent => ({
  id: "agent-1",
  name: "Agent One",
  role: "Engineer",
  platform: "codex",
  protocol: "rest",
  status: "active",
  lastHeartbeat: "2026-07-15T12:00:00.000Z",
  currentTask: null,
  lessonsCount: 0,
  todayMemoryCount: 0,
  location: "local",
  isRemote: false,
  latencyMs: null,
  capabilities: [
    { id: "cap-1", name: "Memory", description: "", tags: [] },
    { id: "cap-2", name: "Tools", description: "", tags: [] },
    { id: "cap-3", name: "Heartbeat", description: "", tags: [] },
  ],
  metadata: {},
  host: null,
  port: null,
  healthEndpoint: null,
  tunnelUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deregisteredAt: null,
  ...overrides,
});

const liveObservation: LivenessObservation = {
  state: "live",
  observedAt: "2026-07-15T12:00:00.000Z",
  freshnessMs: 1000,
  source: "sqlite://registered_agents.last_heartbeat_at",
  reason: "fresh",
};

function row(overrides: Partial<RegisteredAgent> = {}, liveness?: LivenessObservation): RegistryAgentRow {
  return { ...baseAgent(overrides), liveness };
}

describe("AgentRegistryTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state with title and reason", () => {
    render(
      <AgentRegistryTable
        agents={[]}
        onSelect={vi.fn()}
        onDeregister={vi.fn()}
        emptyTitle="No agents here"
        emptyReason="Try widening filters"
      />,
    );
    expect(screen.getByText("No agents here")).toBeInTheDocument();
    expect(screen.getByText("Try widening filters")).toBeInTheDocument();
  });

  it("lists agents with capabilities overflow badge and liveness", () => {
    const onSelect = vi.fn();
    render(
      <AgentRegistryTable
        agents={[
          row(),
          row(
            {
              id: "a2a-adk",
              name: "ADK Agent",
              protocol: "a2a",
              metadata: { a2a: { source: "adk" } },
            },
            liveObservation,
          ),
        ]}
        onSelect={onSelect}
        onDeregister={vi.fn()}
      />,
    );

    expect(screen.getByText("Agent One")).toBeInTheDocument();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A2A").length).toBeGreaterThan(0);
    expect(screen.getByText("ADK")).toBeInTheDocument();
    expect(screen.getAllByText(/^live$/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Agent One"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("shows unknown liveness and never heartbeat when absent", () => {
    render(
      <AgentRegistryTable
        agents={[row({ lastHeartbeat: null }, undefined)]}
        onSelect={vi.fn()}
        onDeregister={vi.fn()}
      />,
    );
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
  });

  it("inline edit saves via mutation and calls onAgentUpdated", async () => {
    const onAgentUpdated = vi.fn();
    const updated = baseAgent({ name: "Renamed", role: "New role" });
    mutate.mockImplementation((_input, options) => {
      options?.onSuccess?.({ agent: updated });
    });

    render(
      <AgentRegistryTable
        agents={[row()]}
        onSelect={vi.fn()}
        onDeregister={vi.fn()}
        onAgentUpdated={onAgentUpdated}
      />,
    );

    fireEvent.click(screen.getByTestId("edit-agent-agent-1"));
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Renamed" } });
    fireEvent.change(screen.getByLabelText("Agent description"), { target: { value: "New role" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onAgentUpdated).toHaveBeenCalledWith(updated);
      expect(mutate).toHaveBeenCalledWith(
        { agentId: "agent-1", name: "Renamed", role: "New role" },
        expect.any(Object),
      );
    });
    expect(screen.getByText("Agent One")).toBeInTheDocument();
  });

  it("inline edit surfaces mutation errors and can cancel", async () => {
    mutate.mockImplementation((_input, options) => {
      options?.onError?.(new Error("Save failed"));
    });

    render(
      <AgentRegistryTable
        agents={[row()]}
        onSelect={vi.fn()}
        onDeregister={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("edit-agent-agent-1"));
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Agent One")).toBeInTheDocument();
  });

  it("deregisters agent and disables actions while deregistering", () => {
    const onDeregister = vi.fn();
    render(
      <AgentRegistryTable
        agents={[row()]}
        onSelect={vi.fn()}
        onDeregister={onDeregister}
        isDeregistering
      />,
    );
    const deregister = screen.getByRole("button", { name: "Deregister" });
    expect(deregister).toBeDisabled();
    fireEvent.click(deregister);
    expect(onDeregister).not.toHaveBeenCalled();
  });
});
