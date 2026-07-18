import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../shell";

let mockPathname = "/";
const mockUseHealth = vi.hoisted(() => vi.fn(() => ({ data: { services: [] } })));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/api-client", () => ({
  useHealth: mockUseHealth,
}));

vi.mock("../sidebar", () => ({
  Sidebar: () => <nav aria-label="Authenticated navigation">Sidebar</nav>,
}));

vi.mock("../top-bar", () => ({
  TopBar: () => <header>TopBar</header>,
}));

vi.mock("../section-tabs", () => ({
  SectionTabs: () => <div>SectionTabs</div>,
}));

vi.mock("../storage-panic-banner", () => ({
  StoragePanicBanner: () => <div>StoragePanicBanner</div>,
}));

describe("Shell", () => {
  beforeEach(() => {
    mockUseHealth.mockClear();
  });

  it.each(["/login", "/register", "/invite/test-token"])(
    "does not wrap auth route %s with authenticated navigation",
    (pathname) => {
      mockPathname = pathname;

      render(
        <Shell publicLandingHost={false}>
          <div>Auth page</div>
        </Shell>
      );

      expect(screen.getByText("Auth page")).toBeInTheDocument();
      expect(screen.queryByLabelText("Authenticated navigation")).not.toBeInTheDocument();
      expect(screen.queryByText("TopBar")).not.toBeInTheDocument();
      expect(mockUseHealth).not.toHaveBeenCalled();
    }
  );

  it("keeps the authenticated shell on app routes", () => {
    mockPathname = "/dispatch";

    render(
      <Shell publicLandingHost={false}>
        <div>Dispatch page</div>
      </Shell>
    );

    expect(screen.getByText("Dispatch page")).toBeInTheDocument();
    expect(screen.getByLabelText("Authenticated navigation")).toBeInTheDocument();
    expect(screen.getByText("TopBar")).toBeInTheDocument();
    expect(mockUseHealth).toHaveBeenCalled();
  });
});
