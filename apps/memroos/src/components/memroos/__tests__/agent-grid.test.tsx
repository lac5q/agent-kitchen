import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Agent } from "@/types";

vi.mock("../agent-card", () => ({
  AgentCard: ({
    agent,
    harnessName,
    childCount,
    onClick,
  }: {
    agent: Agent;
    harnessName?: string;
    childCount: number;
    onClick: (agent: Agent) => void;
  }) => (
    <button type="button" onClick={() => onClick(agent)}>
      {agent.name} harness={harnessName ?? "none"} children={childCount}
    </button>
  ),
}));

vi.mock("../agent-drawer", () => ({
  AgentDrawer: ({
    agent,
    open,
    onOpenChange,
  }: {
    agent: Agent | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="agent-drawer" data-open={String(open)}>
      {agent ? `drawer:${agent.name}` : "drawer:none"}
      {open && (
        <button type="button" onClick={() => onOpenChange(false)}>
          close drawer
        </button>
      )}
    </div>
  ),
}));

import { AgentGrid } from "../agent-grid";

function agent(id: string, name: string, masterId?: string): Agent {
  return {
    id,
    name,
    role: "Agent",
    platform: "codex",
    status: "active",
    currentTask: null,
    memoryCount: 0,
    masterId,
  } as Agent;
}

describe("AgentGrid", () => {
  it("renders empty state for flat and section modes", () => {
    const { rerender } = render(<AgentGrid agents={[]} />);
    expect(screen.getByText("No agents found.")).toBeInTheDocument();

    rerender(<AgentGrid sections={[]} />);
    expect(screen.getByText("No agents found.")).toBeInTheDocument();
  });

  it("dedupes hierarchy inputs, passes harness names and child counts, and closes the drawer", () => {
    const master = agent("master", "Master");
    const child = agent("child", "Child", "master");
    render(<AgentGrid sections={[{ title: "Runtime", agents: [master, child, child] }]} />);

    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Master harness=none children=1" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Child harness=Master children=0" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Child harness=Master children=0" })[0]);
    expect(screen.getByTestId("agent-drawer")).toHaveAttribute("data-open", "true");
    expect(screen.getByText("drawer:Child")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close drawer" }));
    expect(screen.getByTestId("agent-drawer")).toHaveAttribute("data-open", "false");
    expect(screen.getByText("drawer:none")).toBeInTheDocument();
  });

  it("uses flat agents mode even when sections are also provided", () => {
    render(
      <AgentGrid
        agents={[agent("flat", "Flat Agent")]}
        sections={[{ title: "Ignored", agents: [agent("section", "Section Agent")] }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Flat Agent harness=none children=0" })).toBeInTheDocument();
    expect(screen.queryByText("Ignored")).not.toBeInTheDocument();
    expect(screen.queryByText("Section Agent")).not.toBeInTheDocument();
  });

  it("renders an empty section message", () => {
    render(<AgentGrid sections={[{ title: "Dormant", agents: [] }]} />);

    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(screen.getByText("No agents in this group")).toBeInTheDocument();
  });
});
