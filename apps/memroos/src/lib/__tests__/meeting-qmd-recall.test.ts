import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  aggregateSourceStatus,
  loadEnabledMeetingCollections,
  searchMeetingCollections,
} from "../meeting-qmd-recall";
import { SOURCE_STATUS } from "../meeting-source-status";

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
    // Per-collection status: circleback has a known match -> recalled.
    expect(outcome.collectionStatus["meet-recordings-circleback"]?.status).toBe(
      SOURCE_STATUS.recalled
    );
    // Epilogue returned zero -> indexed_unrecalled.
    expect(outcome.collectionStatus["meet-recordings-epilogue"]?.status).toBe(
      SOURCE_STATUS.indexedUnrecalled
    );
  });

  it("Phase 172: surfaces spark-recordings parity (qmd finds == recall returns)", async () => {
    const execFileAsync = async (_file: string, args: string[]) => {
      const collection = args[args.indexOf("-c") + 1];
      const query = args[1];
      const hits: unknown[] =
        collection === "spark-recordings" && String(query).includes("Douglas")
          ? [
              {
                file: "2026-07-15-325.md",
                title: "Eric <> Luis 2026-07-15",
                snippet: "Douglas fintech recap",
                score: 96,
                indexed_at: "2026-07-16T07:12:04Z",
              },
            ]
          : [];
      return { stdout: JSON.stringify(hits), stderr: "" };
    };

    const outcome = await searchMeetingCollections(
      "Douglas fintech",
      10,
      ["spark-recordings"],
      execFileAsync
    );
    expect(outcome.hits.some((h) => h.title.includes("Eric <> Luis"))).toBe(true);
    expect(outcome.collectionStatus["spark-recordings"]?.status).toBe(
      SOURCE_STATUS.recalled
    );
    expect(outcome.collectionStatus["spark-recordings"]?.lastIndexAt).toBe(
      "2026-07-16T07:12:04Z"
    );
    expect(outcome.aggregateStatus).toBe(SOURCE_STATUS.recalled);
  });

  it("Phase 172: empty collection returns indexed_unrecalled, not silent zero", async () => {
    const execFileAsync = async (_file: string, _args: string[]) => {
      return { stdout: JSON.stringify([]), stderr: "" };
    };
    const outcome = await searchMeetingCollections(
      "anything",
      10,
      ["meet-recordings-zoom"],
      execFileAsync
    );
    expect(outcome.collectionStatus["meet-recordings-zoom"]?.status).toBe(
      SOURCE_STATUS.indexedUnrecalled
    );
    expect(outcome.collectionStatus["meet-recordings-zoom"]?.count).toBe(0);
    expect(outcome.aggregateStatus).toBe(SOURCE_STATUS.indexedUnrecalled);
  });

  it("Phase 172: qmd binary failure surfaces indexed_unrecalled, never silent pass", async () => {
    const execFileAsync = async (_file: string, _args: string[]) => {
      throw new Error("qmd: missing collection spark-recordings");
    };
    const outcome = await searchMeetingCollections(
      "anything",
      10,
      ["spark-recordings"],
      execFileAsync
    );
    expect(outcome.collectionStatus["spark-recordings"]?.status).toBe(
      SOURCE_STATUS.indexedUnrecalled
    );
    expect(outcome.collectionStatus["spark-recordings"]?.reason).toContain(
      "missing collection"
    );
    expect(outcome.aggregateStatus).toBe(SOURCE_STATUS.indexedUnrecalled);
    expect(outcome.hits.length).toBe(0);
  });

  it("Phase 172: mixed-state aggregate surfaces the weakest stage the operator must act on", () => {
    const result = aggregateSourceStatus({
      "spark-recordings": {
        collection: "spark-recordings",
        status: SOURCE_STATUS.recalled,
        count: 3,
        lastIndexAt: "2026-07-16T07:12:04Z",
      },
      "meet-recordings-circleback": {
        collection: "meet-recordings-circleback",
        status: SOURCE_STATUS.indexedUnrecalled,
        count: 0,
        lastIndexAt: null,
      },
    });
    // Mixed: spark recalled, circleback empty. Aggregate = weakest = indexed_unrecalled.
    expect(result).toBe(SOURCE_STATUS.indexedUnrecalled);
  });

  it("Phase 172: aggregate with no collections falls back to provider_absent", () => {
    expect(aggregateSourceStatus({})).toBe(SOURCE_STATUS.providerAbsent);
  });
});
