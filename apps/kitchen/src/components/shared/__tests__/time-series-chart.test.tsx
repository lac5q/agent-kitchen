"use client";

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Import AFTER mocks are set up
import { TimeSeriesChart } from "../time-series-chart";

const defaultProps = {
  title: "Test Chart",
  points: [
    { bucket: "Mon", value: 10 },
    { bucket: "Tue", value: 20 },
  ],
  window: "week" as const,
  onWindowChange: vi.fn(),
};

describe("TimeSeriesChart", () => {
  it("renders title text", () => {
    render(<TimeSeriesChart {...defaultProps} />);
    expect(screen.getByText("Test Chart")).toBeDefined();
  });

  it("renders three toggle buttons with correct labels", () => {
    render(<TimeSeriesChart {...defaultProps} />);
    expect(screen.getByText("Day")).toBeDefined();
    expect(screen.getByText("Week")).toBeDefined();
    expect(screen.getByText("Month")).toBeDefined();
  });

  it("active window button has amber text styling", () => {
    render(<TimeSeriesChart {...defaultProps} window="week" />);
    const weekButton = screen.getByText("Week");
    expect(weekButton.className).toContain("text-amber-500");
  });

  it("clicking a different window button calls onWindowChange with new value", () => {
    const onWindowChange = vi.fn();
    render(<TimeSeriesChart {...defaultProps} onWindowChange={onWindowChange} />);
    fireEvent.click(screen.getByText("Day"));
    expect(onWindowChange).toHaveBeenCalledWith("day");
  });

  it("shows loading spinner when isLoading=true", () => {
    render(<TimeSeriesChart {...defaultProps} points={[]} isLoading={true} />);
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBeGreaterThan(0);
  });

  it("shows No data message when points is empty and isLoading=false", () => {
    render(<TimeSeriesChart {...defaultProps} points={[]} isLoading={false} />);
    expect(screen.getByText(/no data/i)).toBeDefined();
  });

  it("renders line-chart when points has data", () => {
    render(<TimeSeriesChart {...defaultProps} />);
    expect(screen.getByTestId("line-chart")).toBeDefined();
  });

  it("accepts optional lineColor prop without error", () => {
    render(<TimeSeriesChart {...defaultProps} lineColor="#10b981" />);
    expect(screen.getByTestId("line-chart")).toBeDefined();
  });
});
