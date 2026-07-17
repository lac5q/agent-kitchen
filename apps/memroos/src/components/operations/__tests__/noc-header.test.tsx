import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { NocHeader } from "../noc-header";

describe("NocHeader", () => {
  const onWindowChange = vi.fn();
  const onWorkspaceChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:noc"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders the NOC title and quick drilldown links with scope params", () => {
    render(
      <NocHeader
        windowLabel="7d"
        workspace="remote"
        onWindowChange={onWindowChange}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );

    expect(screen.getByText("Agent NOC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ledger · 7d\/remote/i })).toHaveAttribute(
      "href",
      expect.stringContaining("from_window=7d"),
    );
    expect(screen.getByRole("link", { name: /Memory · 7d\/remote/i })).toHaveAttribute(
      "href",
      expect.stringContaining("from_scope_note="),
    );
  });

  it("forwards date and workspace selector changes", () => {
    render(
      <NocHeader
        windowLabel="24h"
        workspace="all"
        onWindowChange={onWindowChange}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("NOC date range"), { target: { value: "30d" } });
    fireEvent.change(screen.getByLabelText("NOC workspace"), { target: { value: "local" } });

    expect(onWindowChange).toHaveBeenCalledWith("30d");
    expect(onWorkspaceChange).toHaveBeenCalledWith("local");
  });

  it("exports a JSON report with the current filters", () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        element.click = click;
      }
      return element;
    });

    render(
      <NocHeader
        windowLabel="7d"
        workspace="remote"
        onWindowChange={onWindowChange}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export report" }));

    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(click).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });
});
