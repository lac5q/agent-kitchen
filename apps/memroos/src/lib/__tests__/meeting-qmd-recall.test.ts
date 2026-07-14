import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
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
});
