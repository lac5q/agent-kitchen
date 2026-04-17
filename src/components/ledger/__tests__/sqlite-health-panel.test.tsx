import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

// Mock api-client to control useRecallStats return value
vi.mock("@/lib/api-client", () => ({
  useRecallStats: vi.fn(),
}));

import { SqliteHealthPanel } from "@/components/ledger/sqlite-health-panel";
import { useRecallStats } from "@/lib/api-client";

const mockUseRecallStats = vi.mocked(useRecallStats);

type RecallStats = {
  rowCount: number;
  lastIngest: string | null;
  lastRecallQuery: string | null;
  dbSizeBytes: number;
  timestamp: string;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeStats(overrides?: Partial<RecallStats>): RecallStats {
  return {
    rowCount: 42,
    lastIngest: "2026-04-17T10:00:00.000Z",
    lastRecallQuery: "test query string",
    dbSizeBytes: 12_500_000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Stub fetch to avoid network calls
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      filesProcessed: 2,
      rowsInserted: 10,
      filesSkipped: 1,
      timestamp: new Date().toISOString(),
    }),
  }));
});

describe("SqliteHealthPanel", () => {
  it("Test 1: renders 4 KPI cards with correct labels", () => {
    mockUseRecallStats.mockReturnValue({
      data: makeStats(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRecallStats>);

    render(<SqliteHealthPanel />, { wrapper: makeWrapper() });

    expect(screen.getByText("Conversations")).toBeTruthy();
    expect(screen.getByText("DB Size")).toBeTruthy();
    expect(screen.getByText("Last Ingest")).toBeTruthy();
    expect(screen.getByText("Last Recall")).toBeTruthy();
  });

  it("Test 2: when stats load, displays row count with sky-400 color and DB size with violet-400", () => {
    mockUseRecallStats.mockReturnValue({
      data: makeStats({ rowCount: 42, dbSizeBytes: 12_500_000 }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRecallStats>);

    const { container } = render(<SqliteHealthPanel />, {
      wrapper: makeWrapper(),
    });

    // Row count value "42" should be rendered with sky-400 color
    const skyElements = container.querySelectorAll(".text-sky-400");
    expect(skyElements.length).toBeGreaterThan(0);
    let foundRowCount = false;
    skyElements.forEach((el) => {
      if (el.textContent === "42") foundRowCount = true;
    });
    expect(foundRowCount).toBe(true);

    // DB Size value should be rendered with violet-400 color
    const violetElements = container.querySelectorAll(".text-violet-400");
    expect(violetElements.length).toBeGreaterThan(0);
  });

  it("Test 3: Run Ingest button is visible and clickable", () => {
    mockUseRecallStats.mockReturnValue({
      data: makeStats(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRecallStats>);

    render(<SqliteHealthPanel />, { wrapper: makeWrapper() });

    const button = screen.getByRole("button", { name: /run ingest/i });
    expect(button).toBeTruthy();
    // Clicking should not throw
    fireEvent.click(button);
  });

  it("Test 4: loading state shows dash values in all 4 cards", () => {
    mockUseRecallStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useRecallStats>);

    const { container } = render(<SqliteHealthPanel />, {
      wrapper: makeWrapper(),
    });

    // All 4 cards should show "—" as value in loading state
    const dashElements = Array.from(container.querySelectorAll("p")).filter(
      (el) => el.textContent === "—"
    );
    expect(dashElements.length).toBeGreaterThanOrEqual(4);
  });

  it("Test 5: error state shows 'Database unavailable' message", () => {
    mockUseRecallStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useRecallStats>);

    render(<SqliteHealthPanel />, { wrapper: makeWrapper() });

    expect(screen.getByText(/Database unavailable/i)).toBeTruthy();
  });
});
