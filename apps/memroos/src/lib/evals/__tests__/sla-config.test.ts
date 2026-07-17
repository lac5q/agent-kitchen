// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadEvalConfig } from "../config";
import {
  clearSlaActionConfigCache,
  clearSlaConfigCache,
  getSlaAction,
  getSlaSeconds,
} from "../sla-config";

vi.mock("../config", () => ({
  loadEvalConfig: vi.fn(),
}));

const mockedLoadEvalConfig = vi.mocked(loadEvalConfig);

beforeEach(() => {
  clearSlaConfigCache();
  clearSlaActionConfigCache();
  mockedLoadEvalConfig.mockReset();
});

afterEach(() => {
  clearSlaConfigCache();
  clearSlaActionConfigCache();
});

describe("getSlaSeconds", () => {
  it("returns hardcoded defaults when hil.sla_defaults is absent", () => {
    mockedLoadEvalConfig.mockReturnValue({} as ReturnType<typeof loadEvalConfig>);

    expect(getSlaSeconds("agent_escalate")).toBe(4 * 60 * 60);
    expect(getSlaSeconds("seal_approval")).toBe(24 * 60 * 60);
    expect(getSlaSeconds("eval_below_threshold")).toBe(8 * 60 * 60);
  });

  it("parses duration strings and numeric values from hil.sla_defaults", () => {
    mockedLoadEvalConfig.mockReturnValue({
      hil: {
        sla_defaults: {
          agent_escalate: "2h",
          seal_approval: "30m",
          eval_below_threshold: 7200,
          custom_type: "3600",
          bad_value: "not-a-duration",
        },
      },
    } as unknown as ReturnType<typeof loadEvalConfig>);

    expect(getSlaSeconds("agent_escalate")).toBe(2 * 60 * 60);
    expect(getSlaSeconds("seal_approval")).toBe(30 * 60);
    expect(getSlaSeconds("eval_below_threshold")).toBe(7200);
    expect(getSlaSeconds("custom_type")).toBe(3600);
    expect(getSlaSeconds("bad_value")).toBe(4 * 60 * 60);
  });

  it("falls back to hardcoded defaults when loadEvalConfig throws", () => {
    mockedLoadEvalConfig.mockImplementation(() => {
      throw new Error("config unavailable");
    });

    expect(getSlaSeconds("seal_approval")).toBe(24 * 60 * 60);
  });

  it("returns the global fallback for unknown escalation types", () => {
    mockedLoadEvalConfig.mockReturnValue({} as ReturnType<typeof loadEvalConfig>);
    expect(getSlaSeconds("unknown_escalation")).toBe(4 * 60 * 60);
  });

  it("re-reads config after cache clear", () => {
    mockedLoadEvalConfig.mockReturnValue({
      hil: { sla_defaults: { agent_escalate: "1h" } },
    } as unknown as ReturnType<typeof loadEvalConfig>);
    expect(getSlaSeconds("agent_escalate")).toBe(60 * 60);

    clearSlaConfigCache();
    mockedLoadEvalConfig.mockReturnValue({
      hil: { sla_defaults: { agent_escalate: "3h" } },
    } as unknown as ReturnType<typeof loadEvalConfig>);
    expect(getSlaSeconds("agent_escalate")).toBe(3 * 60 * 60);
  });
});

describe("getSlaAction", () => {
  it("returns hardcoded defaults when hil.sla_actions is absent", () => {
    mockedLoadEvalConfig.mockReturnValue({} as ReturnType<typeof loadEvalConfig>);

    expect(getSlaAction("agent_escalate")).toBe("notify");
    expect(getSlaAction("seal_approval")).toBe("notify");
    expect(getSlaAction("eval_below_threshold")).toBe("auto-resolve");
  });

  it("reads valid actions from hil.sla_actions", () => {
    mockedLoadEvalConfig.mockReturnValue({
      hil: {
        sla_actions: {
          agent_escalate: "abandon",
          seal_approval: "notify",
          eval_below_threshold: "auto-resolve",
        },
      },
    } as unknown as ReturnType<typeof loadEvalConfig>);

    expect(getSlaAction("agent_escalate")).toBe("abandon");
    expect(getSlaAction("seal_approval")).toBe("notify");
    expect(getSlaAction("eval_below_threshold")).toBe("auto-resolve");
  });

  it("falls back when configured action values are invalid", () => {
    mockedLoadEvalConfig.mockReturnValue({
      hil: {
        sla_actions: {
          agent_escalate: "invalid-action",
          custom_type: "also-invalid",
        },
      },
    } as unknown as ReturnType<typeof loadEvalConfig>);

    expect(getSlaAction("agent_escalate")).toBe("notify");
    expect(getSlaAction("custom_type")).toBe("notify");
  });

  it("falls back to hardcoded defaults when loadEvalConfig throws", () => {
    mockedLoadEvalConfig.mockImplementation(() => {
      throw new Error("config unavailable");
    });

    expect(getSlaAction("eval_below_threshold")).toBe("auto-resolve");
  });

  it("defaults unknown escalation types to notify", () => {
    mockedLoadEvalConfig.mockReturnValue({} as ReturnType<typeof loadEvalConfig>);
    expect(getSlaAction("unknown_escalation")).toBe("notify");
  });

  it("re-reads action config after cache clear", () => {
    mockedLoadEvalConfig.mockReturnValue({
      hil: { sla_actions: { agent_escalate: "notify" } },
    } as unknown as ReturnType<typeof loadEvalConfig>);
    expect(getSlaAction("agent_escalate")).toBe("notify");

    clearSlaActionConfigCache();
    mockedLoadEvalConfig.mockReturnValue({
      hil: { sla_actions: { agent_escalate: "abandon" } },
    } as unknown as ReturnType<typeof loadEvalConfig>);
    expect(getSlaAction("agent_escalate")).toBe("abandon");
  });
});
