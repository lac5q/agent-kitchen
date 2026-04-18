import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditLogPanel } from "../audit-log-panel";

// Mock the api-client module to control useAuditLog return values
vi.mock("@/lib/api-client", () => ({
  useAuditLog: vi.fn(),
}));

import { useAuditLog } from "@/lib/api-client";

const mockUseAuditLog = useAuditLog as ReturnType<typeof vi.fn>;

const sampleEntries = [
  {
    id: 1,
    actor: "claude",
    action: "skill_write",
    target: "skills/coding/SKILL.md",
    detail: null,
    severity: "info",
    timestamp: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
  },
  {
    id: 2,
    actor: "hermes",
    action: "memory_write",
    target: "mem0://agent-kitchen/fact-001",
    detail: "Wrote new memory entry",
    severity: "medium",
    timestamp: new Date(Date.now() - 3_600_000).toISOString(), // 1 hr ago
  },
  {
    id: 3,
    actor: "gwen",
    action: "content_flagged",
    target: "input from user",
    detail: "High-severity pattern detected",
    severity: "high",
    timestamp: new Date(Date.now() - 10_000).toISOString(), // just now
  },
];

describe("AuditLogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading spinner while isLoading is true", () => {
    mockUseAuditLog.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<AuditLogPanel />);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders empty state when entries array is empty", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: [], timestamp: "" },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    expect(screen.getByText("No audit events yet.")).toBeInTheDocument();
  });

  it("renders one list item per entry when entries are present", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: sampleEntries, timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("renders actor, action chip, target, and timestamp for each entry", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: sampleEntries, timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    // Actors
    expect(screen.getByText("claude")).toBeInTheDocument();
    expect(screen.getByText("hermes")).toBeInTheDocument();
    expect(screen.getByText("gwen")).toBeInTheDocument();

    // Actions (chips)
    expect(screen.getByText("skill_write")).toBeInTheDocument();
    expect(screen.getByText("memory_write")).toBeInTheDocument();
    expect(screen.getByText("content_flagged")).toBeInTheDocument();

    // Targets
    expect(screen.getByText("skills/coding/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("mem0://agent-kitchen/fact-001")).toBeInTheDocument();
    expect(screen.getByText("input from user")).toBeInTheDocument();

    // Timestamp for 1 min ago entry
    expect(screen.getByText("1m ago")).toBeInTheDocument();
  });

  it("applies slate color classes for info severity chip", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: [sampleEntries[0]], timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    const infoChip = screen.getByText("skill_write");
    expect(infoChip.className).toMatch(/slate/);
  });

  it("applies amber color classes for medium severity chip", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: [sampleEntries[1]], timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    const mediumChip = screen.getByText("memory_write");
    expect(mediumChip.className).toMatch(/amber/);
  });

  it("applies rose color classes for high severity chip", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: [sampleEntries[2]], timestamp: new Date().toISOString() },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    const highChip = screen.getByText("content_flagged");
    expect(highChip.className).toMatch(/rose/);
  });

  it("renders section header with 'Audit Log' text", () => {
    mockUseAuditLog.mockReturnValue({
      data: { entries: [], timestamp: "" },
      isLoading: false,
    });

    render(<AuditLogPanel />);

    expect(screen.getByText("Audit Log")).toBeInTheDocument();
  });
});
