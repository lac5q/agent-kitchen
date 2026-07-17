import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { UserMenu } from "../user-menu";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  document.cookie = "";
});

describe("UserMenu", () => {
  it("renders nothing until the current user is loaded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

    const { container } = render(<UserMenu />);
    expect(container).toBeEmptyDOMElement();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
    });
  });

  it("shows the signed-in user and signs out on click", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "u1",
          email: "ops@example.com",
          displayName: "Ops Lead",
          role: "admin",
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    render(<UserMenu />);

    expect(await screen.findByText("Ops Lead")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      expect(push).toHaveBeenCalledWith("/login");
    });
  });

  it("falls back to email when displayName is empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "u2",
        email: "operator@example.com",
        displayName: "",
        role: "operator",
      }),
    } as Response);

    render(<UserMenu />);

    expect(await screen.findByText("operator@example.com")).toBeInTheDocument();
  });
});
