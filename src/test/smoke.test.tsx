import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryBar } from "@/components/kitchen/summary-bar";
import { KpiCard } from "@/components/ledger/kpi-card";

describe("Kitchen components", () => {
  it("SummaryBar renders stats", () => {
    render(<SummaryBar total={51} active={4} tasks={12} errors={1} />);
    expect(screen.getByText("51")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("Total Chefs")).toBeDefined();
  });
});

describe("Ledger components", () => {
  it("KpiCard renders label and value", () => {
    render(<KpiCard label="Test Metric" value="42" subtitle="units" />);
    expect(screen.getByText("Test Metric")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("units")).toBeDefined();
  });
});
