import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoragePanicBanner } from "../storage-panic-banner";
import type { HealthStatus } from "@/types";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function svc(service: string, status: HealthStatus["status"], detail?: string): HealthStatus {
  return {
    service,
    status,
    latencyMs: 1,
    lastCheck: "2026-07-17T00:00:00.000Z",
    detail,
  };
}

describe("StoragePanicBanner", () => {
  it("renders nothing when storage is healthy", () => {
    const { container } = render(
      <StoragePanicBanner services={[svc("mem0", "up"), svc("Graph Memory", "up"), svc("RTK", "down")]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a panic alert naming Graph Memory when down", () => {
    render(
      <StoragePanicBanner
        services={[svc("Graph Memory", "down", "Neo4j write/read probe failed — graph is NOT storing")]}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Storage panic/i)).toBeInTheDocument();
    expect(screen.getByText("Graph Memory")).toBeInTheDocument();
    expect(screen.getByText(/NOT storing/i)).toBeInTheDocument();
  });
});
