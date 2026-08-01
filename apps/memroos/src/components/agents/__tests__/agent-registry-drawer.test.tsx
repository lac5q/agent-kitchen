import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredAgent } from "@/types";
import type { LivenessObservation } from "@/lib/agent-liveness";

import { AgentRegistryDrawer } from "../agent-registry-drawer";

const baseAgent: RegisteredAgent = {
  id: "rest-agent",
  name: "REST Agent",
  role: "Reports liveness",
  platform: "codex",
  protocol: "rest",
  status: "active",
  lastHeartbeat: "2026-05-05T06:00:00.000Z",
  currentTask: "checking in",
  lessonsCount: 0,
  todayMemoryCount: 0,
  location: "local",
  isRemote: false,
  latencyMs: null,
  capabilities: [{ id: "heartbeat", name: "Heartbeat", description: "", tags: [] }],
  metadata: {},
  host: null,
  port: null,
  healthEndpoint: null,
  tunnelUrl: null,
  createdAt: "2026-05-05T06:00:00.000Z",
  updatedAt: "2026-05-05T06:00:00.000Z",
  deregisteredAt: null,
};

const a2aAgent: RegisteredAgent = {
  ...baseAgent,
  id: "adk-prime",
  name: "ADK Prime Agent",
  role: "Checks prime numbers",
  platform: "gemini",
  protocol: "a2a",
  currentTask: null,
  lastHeartbeat: null,
  capabilities: [],
  metadata: {
    a2a: {
      cardUrl: "https://user:pass@example.test/.well-known/agent-card.json",
      endpointUrl: "https://user:pass@example.test/a2a/check_prime_agent",
      version: "1.0",
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
        apiKeyAuth: { type: "apiKey", in: "header", name: "Authorization" },
      },
      inputModes: ["text"],
      outputModes: ["text"],
      validationStatus: "validated",
      lastFetchedAt: "2026-05-05T06:04:00.000Z",
      source: "adk",
      streaming: true,
    },
  },
};

const liveness: LivenessObservation = {
  state: "live",
  observedAt: "2026-05-05T06:00:00.000Z",
  freshnessMs: 2500,
  source: "sqlite://registered_agents.last_heartbeat_at",
  reason: "fresh heartbeat",
};

describe("AgentRegistryDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns null when no agent is provided", () => {
    const { container } = render(
      <AgentRegistryDrawer agent={null} open={false} onOpenChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders capabilities, current task, and liveness details", () => {
    render(
      <AgentRegistryDrawer
        agent={baseAgent}
        liveness={liveness}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("REST Agent")).toBeInTheDocument();
    expect(screen.getByText("Heartbeat")).toBeInTheDocument();
    expect(screen.getByText("checking in")).toBeInTheDocument();
    expect(screen.getByText(/source=sqlite:\/\/registered_agents\.last_heartbeat_at/)).toBeInTheDocument();
    expect(screen.getByText(/fresh heartbeat/)).toBeInTheDocument();
  });

  it("renders A2A metadata without credential-bearing strings", () => {
    render(
      <AgentRegistryDrawer agent={a2aAgent} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText("A2A connection")).toBeInTheDocument();
    expect(screen.getAllByText("example.test").length).toBeGreaterThan(0);
    expect(screen.getByText("supported")).toBeInTheDocument();
    expect(screen.getAllByText("ADK").length).toBeGreaterThan(0);
    expect(screen.getByText("None declared")).toBeInTheDocument();
    expect(screen.queryByText(/user:pass@/)).not.toBeInTheDocument();
  });

  it("saves edited name and role via PATCH and notifies parent", async () => {
    const onAgentUpdated = vi.fn();
    const updated = { ...baseAgent, name: "Renamed Agent", role: "New role" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ agent: updated }),
      }),
    );

    render(
      <AgentRegistryDrawer
        agent={baseAgent}
        open
        onOpenChange={vi.fn()}
        onAgentUpdated={onAgentUpdated}
      />,
    );

    fireEvent.click(screen.getByTestId("edit-agent-details"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed Agent" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "New role" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onAgentUpdated).toHaveBeenCalledWith(updated);
    });
    expect(screen.getByText("Renamed Agent")).toBeInTheDocument();
  });

  it("surfaces save errors and can cancel editing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      }),
    );

    render(<AgentRegistryDrawer agent={baseAgent} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId("edit-agent-details"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Save" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Forbidden")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("edit-agent-details")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("disables save when fields are empty or unchanged", () => {
    render(<AgentRegistryDrawer agent={baseAgent} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("edit-agent-details"));
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "REST Agent" } });
    expect(saveButton).toBeDisabled();
  });
});
