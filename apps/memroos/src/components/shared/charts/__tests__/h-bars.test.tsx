import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HBars } from "../h-bars";

describe("HBars", () => {
  const sampleRows = [
    { label: "Alpha", value: 10 },
    { label: "Beta", value: 20 },
    { label: "Gamma", value: 5 },
  ];

  it("renders all row labels and values", () => {
    const { container } = render(<HBars rows={sampleRows} />);
    const text = container.textContent ?? "";

    expect(text).toContain("Alpha");
    expect(text).toContain("Beta");
    expect(text).toContain("Gamma");
    expect(text).toContain("10");
    expect(text).toContain("20");
    expect(text).toContain("5");
  });

  it("appends unit suffix to values", () => {
    const rows = [{ label: "Time", value: 42, unit: "ms" }];
    const { container } = render(<HBars rows={rows} />);

    expect(container.textContent).toContain("42ms");
  });

  it("scales bar widths relative to the max value", () => {
    const rows = [
      { label: "A", value: 50 },
      { label: "B", value: 100 },
    ];
    const { container } = render(<HBars rows={rows} />);
    const bars = container.querySelectorAll('[style*="height: 14px"] > div');

    expect(bars.length).toBe(2);
    const widths = Array.from(bars).map((el) =>
      (el as HTMLElement).style.width
    );
    expect(widths[0]).toBe("50%");
    expect(widths[1]).toBe("100%");
  });

  it("uses per-row color when provided", () => {
    const rows = [{ label: "X", value: 10, color: "#ff0000" }];
    const { container } = render(<HBars rows={rows} />);
    const bar = container.querySelector('[style*="height: 14px"] > div') as HTMLElement;

    expect(bar.style.background).toBe("rgb(255, 0, 0)");
  });

  it("uses accent color when row has flag and accent is set", () => {
    const rows = [{ label: "Flagged", value: 10, flag: true }];
    const { container } = render(<HBars rows={rows} accent="#00ff00" />);
    const bar = container.querySelector('[style*="height: 14px"] > div') as HTMLElement;

    expect(bar.style.background).toBe("rgb(0, 255, 0)");
  });

  it("uses default color when row has flag but no accent is set", () => {
    const rows = [{ label: "Flagged", value: 10, flag: true }];
    const { container } = render(<HBars rows={rows} />);
    const bar = container.querySelector('[style*="height: 14px"] > div') as HTMLElement;

    // Default color is NOC.ink = "#0f0f0e"
    expect(bar.style.background).toBe("rgb(15, 15, 14)");
  });

  it("uses default color for non-flagged rows even when accent is set", () => {
    const rows = [{ label: "Normal", value: 10, flag: false }];
    const { container } = render(<HBars rows={rows} accent="#00ff00" />);
    const bar = container.querySelector('[style*="height: 14px"] > div') as HTMLElement;

    // accent only applies when flag is true; falls back to default color
    expect(bar.style.background).toBe("rgb(15, 15, 14)");
  });

  it("handles a single row with value 0 (max floor of 1)", () => {
    const rows = [{ label: "Zero", value: 0 }];
    const { container } = render(<HBars rows={rows} />);
    const bar = container.querySelector('[style*="height: 14px"] > div') as HTMLElement;

    // Math.max(1, 0) = 1, so width = 0/1 * 100 = 0%
    expect(bar.style.width).toBe("0%");
  });

  it("renders an empty rows array without errors", () => {
    const { container } = render(<HBars rows={[]} />);
    const bars = container.querySelectorAll('[style*="height: 14px"] > div');
    expect(bars.length).toBe(0);
  });
});
