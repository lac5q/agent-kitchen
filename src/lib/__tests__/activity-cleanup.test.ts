import { describe, it, expect } from "vitest";
import { cleanMessage } from "../activity-cleanup";

describe("cleanMessage", () => {
  it("strips === banner delimiters and timestamps", () => {
    const input = "=== APO Cycle Starting 2026-04-09T14:33:22 ===";
    expect(cleanMessage(input)).toBe("APO Cycle Starting");
  });

  it("strips --- delimiters", () => {
    const input = "--- Summary ---";
    expect(cleanMessage(input)).toBe("Summary");
  });

  it("strips leading [timestamp] bracket form", () => {
    const input = "[2026-04-09 14:33:22] Some message";
    expect(cleanMessage(input)).toBe("Some message");
  });

  it("strips mid-string ISO-8601 timestamps", () => {
    const input = "Text with 2026-04-09T14:33:22.000Z mid-string";
    expect(cleanMessage(input)).toBe("Text with mid-string");
  });

  it("returns empty string for lone noise words", () => {
    const input = "Starting";
    expect(cleanMessage(input)).toBe("");
  });

  it("passes through normal messages unchanged", () => {
    const input = "Normal message without noise";
    expect(cleanMessage(input)).toBe("Normal message without noise");
  });

  it("strips separator-only lines (=== only)", () => {
    const input = "==================================================\n";
    expect(cleanMessage(input)).toBe("");
  });
});
