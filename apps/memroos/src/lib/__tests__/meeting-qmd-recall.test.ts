import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_MEETING_COLLECTIONS,
  loadEnabledMeetingCollections,
  searchMeetingCollections,
} from "../meeting-qmd-recall";

describe("meeting-qmd-recall", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "meet-qmd-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads enabled meeting collections from config", async () => {
    const cfgPath = join(dir, "meeting-sources.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        sources: [
          {
            id: "circleback",
            enabled: true,
            qmdCollections: ["meet-recordings-circleback"],
          },
          {
            id: "fathom",
            enabled: false,
            qmdCollections: ["meet-recordings-epilogue"],
          },
        ],
      })
    );

    const cols = await loadEnabledMeetingCollections(cfgPath);
    expect(cols).toEqual(["meet-recordings-circleback"]);
  });

  it("searchMeetingCollections federates without agent -c (injected runner)", async () => {
    const execFileAsync = async (_file: string, args: string[]) => {
      const collection = args[args.indexOf("-c") + 1];
      const query = args[1];
      let hits: unknown[] = [];
      if (collection === "meet-recordings-circleback" && String(query).includes("Monaco")) {
        hits = [
          {
            file: "2026-07-09-monaco-cordant-follow-up.md",
            title: "Monaco Cordant Follow-up",
            snippet: "Circleback Monaco",
            score: 11,
          },
        ];
      }
      return { stdout: JSON.stringify(hits), stderr: "" };
    };

    const outcome = await searchMeetingCollections(
      "Monaco Cordant",
      5,
      ["meet-recordings-circleback", "meet-recordings-epilogue"],
      execFileAsync
    );
    expect(outcome.hits.some((h) => h.title.includes("Monaco"))).toBe(true);
    expect(outcome.collections).toContain("meet-recordings-circleback");
  });

  it("falls back to default collections when config files are missing or empty", async () => {
    const cfgPath = join(dir, "meeting-sources.json");
    writeFileSync(cfgPath, JSON.stringify({ sources: [{ enabled: true, qmdCollections: [] }] }));

    await expect(loadEnabledMeetingCollections(cfgPath)).resolves.toEqual([...DEFAULT_MEETING_COLLECTIONS]);
    await expect(loadEnabledMeetingCollections(join(dir, "missing.json"))).resolves.toEqual([
      ...DEFAULT_MEETING_COLLECTIONS,
    ]);
  });

  it("normalizes nested qmd result shapes, primitive hits, duplicates, and path-derived titles", async () => {
    const execFileAsync = async (_file: string, args: string[]) => {
      const collection = args[args.indexOf("-c") + 1];
      if (collection === "primary") {
        return {
          stdout: JSON.stringify({
            results: [
              { file: "notes/weekly.md", excerpt: "Weekly excerpt", score: 7 },
              { file: "notes/weekly.md", text: "duplicate should be suppressed", score: 6 },
              "primitive hit",
            ],
          }),
          stderr: "",
        };
      }
      return {
        stdout: JSON.stringify({ file: "single.md", content: "single object content" }),
        stderr: "",
      };
    };

    const outcome = await searchMeetingCollections("weekly", 5, ["primary", "secondary"], execFileAsync);

    expect(outcome.ok).toBe(true);
    expect(outcome.hits.map((hit) => hit.id)).toEqual([
      "qmd:primary:notes/weekly.md",
      "qmd:primary:2",
      "qmd:secondary:single.md",
    ]);
    expect(outcome.hits[0]).toMatchObject({
      title: "weekly.md",
      content: "Weekly excerpt",
      path: "notes/weekly.md",
      score: 7,
    });
    expect(outcome.hits[1]).toMatchObject({ title: "primary hit", content: "primitive hit" });
  });

  it("returns typed errors for blank queries and all-failed searches", async () => {
    await expect(searchMeetingCollections("   ")).resolves.toEqual({
      ok: false,
      hits: [],
      error: "query is required",
      collections: [],
    });

    const outcome = await searchMeetingCollections(
      "Monaco",
      5,
      ["missing"],
      async () => {
        throw new Error("collection not indexed");
      },
    );
    expect(outcome).toMatchObject({
      ok: false,
      hits: [],
      error: "collection not indexed",
      collections: ["missing"],
    });
  });
});
