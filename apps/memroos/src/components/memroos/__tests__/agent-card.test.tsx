import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Agent } from "@/types";
import { AgentCard, formatTimeAgo } from "../agent-card";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Agent One",
    role: "Worker",
    platform: "codex",
    status: "active",
    currentTask: null,
    memoryCount: 0,
    lastHeartbeat: null,
    lessonsCount: 2,
    todayMemoryCount: 3,
    ...overrides,
  } as Agent;
}

describe("AgentCard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats heartbeat ages across null, minute, hour, and day boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));

    expect(formatTimeAgo(null)).toBe("never");
    expect(formatTimeAgo("2026-07-18T11:59:45.000Z")).toBe("just now");
    expect(formatTimeAgo("2026-07-18T11:30:00.000Z")).toBe("30m ago");
    expect(formatTimeAgo("2026-07-18T09:00:00.000Z")).toBe("3h ago");
    expect(formatTimeAgo("2026-07-16T12:00:00.000Z")).toBe("2d ago");
  });

  it("renders harness, subagent, remote, task, fallback status, and invokes click", () => {
    const onClick = vi.fn();
    const agent = makeAgent({
      name: "Remote Subagent",
      platform: "unknown-platform",
      status: "custom-status",
      masterId: "master-agent",
      isRemote: true,
      location: "cloudflare",
      latencyMs: 42,
      currentTask: "Review memory receipts",
    });

    render(
      <AgentCard
        agent={agent}
        harnessName="Master Agent"
        childCount={1}
        onClick={onClick}
      />
    );

    expect(screen.getByText("Subagent of")).toBeInTheDocument();
    expect(screen.getByText("Master Agent")).toBeInTheDocument();
    expect(screen.getByText("unknown-platform")).toBeInTheDocument();
    expect(screen.getByText("CF Tunnel")).toBeInTheDocument();
    expect(screen.getByText("~42ms")).toBeInTheDocument();
    expect(screen.getByText("Task:")).toBeInTheDocument();
    expect(screen.getByText("Review memory receipts")).toBeInTheDocument();
    expect(screen.getByText("custom-status")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remote Subagent"));
    expect(onClick).toHaveBeenCalledWith(agent);
  });

  it("renders local harness copy and pluralizes child counts", () => {
    render(
      <AgentCard
        agent={makeAgent({ name: "Harness Agent", status: "idle" })}
        childCount={2}
        onClick={() => {}}
      />
    );

    expect(screen.getByText("Harness for")).toBeInTheDocument();
    expect(screen.getByText("2 subagents")).toBeInTheDocument();
    expect(screen.getByText("2 lessons")).toBeInTheDocument();
    expect(screen.getByText("3 mem")).toBeInTheDocument();
  });
});
