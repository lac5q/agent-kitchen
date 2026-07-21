import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "../top-bar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("TopBar", () => {
  it("uses a stable clock placeholder during server rendering", () => {
    const html = renderToString(<TopBar services={[]} />);

    expect(html).toContain('data-topbar-clock="true"');
    expect(html).toContain(">—</span>");
  });
});
