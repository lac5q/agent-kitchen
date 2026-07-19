import { describe, expect, it } from "vitest";

import { COLORS, PLATFORM_LABELS, POLL_INTERVALS, STATUS_COLORS } from "../ui-constants";

describe("ui-constants", () => {
  it("declares poll intervals for every operator dashboard panel", () => {
    expect(POLL_INTERVALS).toEqual({
      agents: 15000,
      tokens: 30000,
      memory: 15000,
      knowledge: 60000,
      health: 30000,
      skills: 60000,
      hive: 15000,
      paperclip: 15000,
      voice: 2000,
    });
  });

  it("exposes shared color tokens", () => {
    expect(COLORS).toEqual({
      bg: "hsl(222.2, 84%, 4.9%)",
      accent: "#f59e0b",
      success: "#10b981",
      danger: "#f43f5e",
      info: "#0ea5e9",
      muted: "#64748b",
      cardBg: "hsl(222.2, 84%, 6.9%)",
    });
  });

  it("maps each status to a token from the COLORS palette", () => {
    expect(STATUS_COLORS).toEqual({
      active: COLORS.success,
      idle: COLORS.accent,
      dormant: COLORS.muted,
      error: COLORS.danger,
      up: COLORS.success,
      degraded: COLORS.accent,
      down: COLORS.danger,
    });
  });

  it("resolves human-friendly platform labels for every supported agent", () => {
    expect(PLATFORM_LABELS["pi"]).toBe("Pi");
    expect(PLATFORM_LABELS["droid"]).toBe("Droid");
    expect(PLATFORM_LABELS["claude"]).toBe("Claude");
    expect(PLATFORM_LABELS["cursor"]).toBe("Cursor");
    expect(PLATFORM_LABELS["codex"]).toBe("Codex");
    expect(PLATFORM_LABELS["qwen"]).toBe("Qwen");
    expect(PLATFORM_LABELS["gemini"]).toBe("Gemini");
    expect(PLATFORM_LABELS["opencode"]).toBe("OpenCode");
    expect(PLATFORM_LABELS["zcode"]).toBe("ZCode");
    expect(PLATFORM_LABELS["cortex"]).toBe("Cortex");
    expect(PLATFORM_LABELS["hermes"]).toBe("Hermes");
    expect(PLATFORM_LABELS["openclaw"]).toBe("OpenClaw");
    expect(PLATFORM_LABELS["chatgpt"]).toBe("ChatGPT");
    expect(PLATFORM_LABELS["grok"]).toBe("Grok");
  });
});
