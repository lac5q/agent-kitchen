// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRest } from "../mcp-client";

describe("callRest: GET arguments travel in the query string", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [], nextPageToken: null }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes args into the URL and sends no body on GET", async () => {
    await callRest("https://www.googleapis.com", "tok", {
      method: "GET",
      path: "/drive/v3/files",
      body: { pageSize: 50, orderBy: "modifiedTime desc", pageToken: "abc" },
    });

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = new URL(url as string);

    expect(parsed.pathname).toBe("/drive/v3/files");
    expect(parsed.searchParams.get("pageSize")).toBe("50");
    expect(parsed.searchParams.get("orderBy")).toBe("modifiedTime desc");
    expect(parsed.searchParams.get("pageToken")).toBe("abc");
    // A GET carrying a body is rejected by fetch, and any server that
    // tolerated it would ignore the params and return default results.
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("still sends a JSON body on POST", async () => {
    await callRest("https://api.notion.com", "tok", {
      method: "POST",
      path: "/v1/search",
      body: { start_cursor: "c1" },
    });

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/search");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      start_cursor: "c1",
    });
  });
});
