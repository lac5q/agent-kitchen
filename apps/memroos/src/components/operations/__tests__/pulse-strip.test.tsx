import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricEnvelope } from "@/lib/metric-status";
import { PulseStrip } from "../pulse-strip";

const api = vi.hoisted(() => ({
  useOperationsNoc: vi.fn(),
  useModelUsage: vi.fn(),
  useTimeSeries: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  useOperationsNoc: api.useOperationsNoc,
  useModelUsage: api.useModelUsage,
  useTimeSeries: api.useTimeSeries,
}));

function envelope(
  status: MetricEnvelope<number>["status"] = "empty",
  value: number | null = null,
  source = "sqlite://test",
): MetricEnvelope<number> {
  return {
    value,
    status,
    source,
    observedAt: status === "live" ? "2026-07-20T12:00:00.000Z" : null,
    freshnessMs: status === "live" ? 1000 : null,
    scope: { window: "24h", workspace: "all" },
    reason: status === "empty" ? "Healthy source has no observations in the selected window" : null,
  };
}

function nocResponse(overrides: Record<string, unknown> = {}) {
  return {
    metrics: {
      memoryRows: envelope("empty", null, "sqlite://messages"),
      enabledSkills: envelope("empty", null, "sqlite://skill_registry"),
      cronWarnings: envelope("empty", null, "sqlite://cron_health_jobs"),
    },
    agentActivity: {
      sourceState: "no_history",
      source: "sqlite://messages",
      observedAt: null,
      agents: [],
      delegations: [],
    },
    sourceStates: {
      agentActivity: "no_history",
      efficiencySignals: "known_unwired",
    },
    ...overrides,
  };
}

function setEmptySources() {
  api.useOperationsNoc.mockReturnValue({
    data: nocResponse(),
    isLoading: false,
    isError: false,
  });
  api.useTimeSeries.mockReturnValue({
    data: { points: [], metric: "memory_writes", window: "day", timestamp: "2026-07-20T12:00:00.000Z" },
    isLoading: false,
    isError: false,
  });
  api.useModelUsage.mockReturnValue({
    data: {
      usage: {
        models: [],
        total: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, requests: 0 },
      },
      timestamp: "2026-07-20T12:00:00.000Z",
    },
    isLoading: false,
    isError: false,
  });
}

describe("PulseStrip Phase 174 day-1 signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEmptySources();
  });

  it("renders only the approved six reliable pulse cards", () => {
    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(screen.getByText("Messages · 24h")).toBeInTheDocument();
    expect(screen.getByText("Memory writes · 24h")).toBeInTheDocument();
    expect(screen.getByText("Cron health")).toBeInTheDocument();
    expect(screen.getByText("Skills enabled")).toBeInTheDocument();
    expect(screen.getByText("Active models · 24h")).toBeInTheDocument();
    expect(screen.getByText("Last activity")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-card-label]")).toHaveLength(6);

    expect(screen.queryByText(/Hive actions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Active dispatches/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Savings baseline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed work/i)).not.toBeInTheDocument();
  });

  it("renders semantic no-history copy without generic forbidden empties", () => {
    const { container } = render(
      <PulseStrip filters={{ window: "24h", workspace: "local" }} />,
    );

    expect(screen.getAllByText(/No message history yet/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Memory-write timing is not workspace-partitioned/i)).toBeInTheDocument();
    expect(screen.getByText(/No enabled skills yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Model usage is not workspace-partitioned/i)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(new RegExp(["No", "events"].join(" "), "i"));
    expect(container.textContent ?? "").not.toMatch(new RegExp(["empty", "by", "design"].join(" "), "i"));
  });

  it("renders live messages, writes, skills, models, cron health, and last activity", () => {
    api.useOperationsNoc.mockReturnValue({
      data: nocResponse({
        metrics: {
          memoryRows: envelope("live", 12, "sqlite://messages"),
          enabledSkills: envelope("live", 5, "sqlite://skill_registry"),
          cronWarnings: envelope("empty", null, "sqlite://cron_health_jobs"),
        },
        agentActivity: {
          sourceState: "live",
          source: "sqlite://messages",
          observedAt: "2026-07-20T12:00:00.000Z",
          agents: [],
          delegations: [],
        },
        sourceStates: {
          agentActivity: "live",
          efficiencySignals: "known_unwired",
        },
      }),
      isLoading: false,
      isError: false,
    });
    api.useTimeSeries.mockReturnValue({
      data: {
        points: [{ bucket: "12:00", value: 4 }],
        metric: "memory_writes",
        window: "day",
        timestamp: "2026-07-20T12:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    });
    api.useModelUsage.mockReturnValue({
      data: {
        usage: {
          models: [
            { id: "k3", name: "k3", requests: 2, totalTokens: 10, inputTokens: 6, outputTokens: 4, cacheRead: 0, cacheCreation: 0 },
            { id: "m3", name: "m3", requests: 1, totalTokens: 5, inputTokens: 3, outputTokens: 2, cacheRead: 0, cacheCreation: 0 },
          ],
          total: { inputTokens: 9, outputTokens: 6, cacheRead: 0, cacheCreation: 0, requests: 3 },
        },
        timestamp: "2026-07-20T12:00:00.000Z",
      },
      isLoading: false,
      isError: false,
    });

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    const messages = screen.getByText("Messages · 24h").closest("[data-card-label]");
    const writes = screen.getByText("Memory writes · 24h").closest("[data-card-label]");
    const cron = screen.getByText("Cron health").closest("[data-card-label]");
    const skills = screen.getByText("Skills enabled").closest("[data-card-label]");
    const models = screen.getByText("Active models · 24h").closest("[data-card-label]");
    expect(messages && within(messages).getByText("12")).toBeInTheDocument();
    expect(writes && within(writes).getByText("4")).toBeInTheDocument();
    expect(cron && within(cron).getByText("clear")).toBeInTheDocument();
    expect(skills && within(skills).getByText("5")).toBeInTheDocument();
    expect(models && within(models).getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText(/2026-07-20 12:00:00Z/).length).toBeGreaterThan(0);
  });

  it.each([
    ["24h", "day"],
    ["7d", "week"],
    ["30d", "month"],
  ] as const)("forwards the %s window and workspace filter", (window, timeWindow) => {
    render(<PulseStrip filters={{ window, workspace: "remote" }} />);

    expect(api.useOperationsNoc).toHaveBeenCalledWith({ window, workspace: "remote" });
    expect(api.useTimeSeries).toHaveBeenCalledWith("memory_writes", timeWindow);
    expect(api.useModelUsage).toHaveBeenCalledWith(expect.stringMatching(/T.*Z$/));
  });

  it("keeps source errors distinct from empty state", () => {
    api.useOperationsNoc.mockReturnValue({
      data: nocResponse({
        metrics: {
          memoryRows: envelope("error", null, "sqlite://messages"),
          enabledSkills: envelope("empty", null, "sqlite://skill_registry"),
          cronWarnings: envelope("empty", null, "sqlite://cron_health_jobs"),
        },
        agentActivity: {
          sourceState: "stale_or_error",
          source: "sqlite://messages",
          observedAt: null,
          agents: [],
          delegations: [],
        },
      }),
      isLoading: false,
      isError: false,
    });

    render(<PulseStrip filters={{ window: "24h", workspace: "all" }} />);

    expect(document.querySelectorAll('[data-status="error"]').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/stale or unavailable/i).length).toBeGreaterThan(0);
  });

  // Phase 174 watcher fix #3: every default pulse card must carry a
  // semantic four-state `data-status-block` value — never the raw
  // MetricStatus values like "empty", "zero", "blocked", "degraded".
  it("renders a four-state semantic data-status-block on every default card", () => {
    const { container } = render(
      <PulseStrip filters={{ window: "24h", workspace: "all" }} />,
    );

    const cards = Array.from(container.querySelectorAll("[data-card-label]"));
    expect(cards.length).toBe(6);
    const allowed = new Set(["live", "window_empty", "no_history", "stale_or_error"]);
    for (const card of cards) {
      const block = card.querySelector("[data-status-block]");
      expect(block, `card ${card.getAttribute("data-card-label")} missing status block`).not.toBeNull();
      const value = block?.getAttribute("data-status-block");
      expect(allowed.has(value ?? ""), `card ${card.getAttribute("data-card-label")} has invalid status ${value}`).toBe(true);
      expect(["empty", "zero", "blocked", "degraded", "unavailable", "stale"]).not.toContain(value);
    }
  });

  it("honors the agent sourceState for Messages and Last activity cards", () => {
    api.useOperationsNoc.mockReturnValue({
      data: nocResponse({
        agentActivity: {
          sourceState: "window_empty",
          source: "sqlite://messages",
          observedAt: null,
          agents: [],
          delegations: [],
        },
        sourceStates: {
          agentActivity: "window_empty",
          efficiencySignals: "known_unwired",
        },
      }),
      isLoading: false,
      isError: false,
    });

    const { container } = render(
      <PulseStrip filters={{ window: "24h", workspace: "all" }} />,
    );

    const messagesCard = container.querySelector('[data-card-label="Messages · 24h"]');
    const lastCard = container.querySelector('[data-card-label="Last activity"]');
    expect(messagesCard?.querySelector('[data-status-block="window_empty"]')).not.toBeNull();
    expect(lastCard?.querySelector('[data-status-block="window_empty"]')).not.toBeNull();
  });

  it("keeps loading distinct from no_history at the data-status-block layer", () => {
    api.useOperationsNoc.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    api.useTimeSeries.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    api.useModelUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(
      <PulseStrip filters={{ window: "24h", workspace: "all" }} />,
    );

    const blocks = Array.from(
      container.querySelectorAll("[data-card-label] [data-status-block]"),
    ).map((b) => b.getAttribute("data-status-block"));
    expect(blocks.length).toBe(6);
    for (const value of blocks) {
      expect(value).toBe("loading");
      expect(value).not.toBe("no_history");
    }
  });
});
