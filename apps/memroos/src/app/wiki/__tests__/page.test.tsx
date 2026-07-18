/**
 * /wiki page client coverage — empty vault + loaded tree/page states.
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

import WikiPageView from "@/app/wiki/page";

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

describe("WikiPageView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/wiki");
  });

  it("renders empty-vault messaging when the wiki root is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes("view=tree")) {
          return Response.json({
            ok: true,
            exists: false,
            wikiRoot: "/tmp/missing",
            tree: [],
          });
        }
        if (url.includes("view=graph")) {
          return Response.json({
            ok: true,
            exists: false,
            graph: { exists: false, nodes: [], edges: [], reason: "wiki_root_missing" },
          });
        }
        return Response.json({ ok: true, exists: false, page: null });
      })
    );

    render(<WikiPageView />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Wiki" })).toBeTruthy();
    });
    expect(screen.getByText(/Wiki vault not found/i)).toBeTruthy();
    expect(screen.getByText(/\/tmp\/missing/)).toBeTruthy();
  });

  it("loads tree, opens a page, and runs search", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("view=tree")) {
        return Response.json({
          ok: true,
          exists: true,
          wikiRoot: "/tmp/wiki",
          tree: [
            { name: "index.md", path: "index.md", type: "file" },
            {
              name: "memroos-digest",
              path: "memroos-digest",
              type: "dir",
              children: [{ name: "hello.md", path: "memroos-digest/hello.md", type: "file" }],
            },
          ],
        });
      }
      if (url.includes("view=page") && url.includes("hello.md")) {
        return Response.json({
          ok: true,
          exists: true,
          page: {
            path: "memroos-digest/hello.md",
            title: "Hello",
            content: "# Hello\n\nBody.",
            mtime: "2026-07-18T00:00:00.000Z",
          },
        });
      }
      if (url.includes("view=page")) {
        return Response.json({
          ok: true,
          exists: true,
          page: {
            path: "index.md",
            title: "Wiki Index",
            content: "# Wiki Index\n\nSee [[hello]].",
            mtime: "2026-07-18T00:00:00.000Z",
          },
        });
      }
      if (url.includes("view=graph")) {
        return Response.json({
          ok: true,
          exists: true,
          graph: {
            exists: true,
            nodes: [{ id: "hello", label: "Hello Node", path: "memroos-digest/hello.md" }],
            edges: [{ source: "a", target: "b" }],
          },
        });
      }
      if (url.includes("view=search")) {
        return Response.json({
          ok: true,
          exists: true,
          hits: [{ path: "memroos-digest/hello.md", title: "Hello", snippet: "Body." }],
        });
      }
      return Response.json({ ok: false }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WikiPageView />);
    await waitFor(() => {
      expect(screen.getByText("index.md")).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Wiki Index" })).toBeTruthy();
    });
    expect(screen.getByText("1 edge(s)")).toBeTruthy();
    expect(screen.getByTestId("markdown").textContent).toContain("/wiki?path=");

    fireEvent.change(screen.getByPlaceholderText(/Search wiki/i), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(screen.getByText("Body.")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Hello Node" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Hello" })).toBeTruthy();
    });
  });

  it("shows select-page and page errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes("view=tree")) {
          return Response.json({
            ok: true,
            exists: true,
            wikiRoot: "/tmp/wiki",
            tree: [{ name: "missing.md", path: "missing.md", type: "file" }],
          });
        }
        if (url.includes("view=graph")) {
          return Response.json({
            ok: true,
            graph: { exists: false, nodes: [], edges: [], reason: "graph_unavailable" },
          });
        }
        if (url.includes("view=page")) {
          return Response.json({ ok: false, error: "page_not_found" }, { status: 404 });
        }
        return Response.json({ ok: false }, { status: 404 });
      })
    );

    render(<WikiPageView />);
    await waitFor(() => {
      expect(screen.getByText("page_not_found")).toBeTruthy();
    });
    expect(screen.getByText(/Select a page from the tree/i)).toBeTruthy();
    expect(screen.getByText(/graph_unavailable/i)).toBeTruthy();
  });
});
