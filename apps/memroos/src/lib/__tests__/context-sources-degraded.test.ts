// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  deepMergeConfigs,
  evaluateContextSources,
  requireFreshContextSources,
  type ContextSourcesConfig,
} from "../context-sources";

function config(): ContextSourcesConfig {
  return {
    sources: [
      {
        id: "spark",
        type: "spark",
        enabled: true,
        requiredTools: ["python3"],
        envVars: [],
        sourcePath: "./spark",
        ingestCommand: "spark ingest",
        indexCommand: "qmd index spark",
        freshnessThresholdMinutes: 60,
        qmdCollection: "spark",
        safeAnswerPolicy: "source_required",
      },
    ],
  };
}

describe("context source degraded and merge helpers", () => {
  it("marks missing tools/env as degraded with repair hints", () => {
    const cfg = config();
    cfg.sources[0].envVars = ["MISSING_ENV_VAR"];
    const health = evaluateContextSources(cfg, {
      now: new Date("2026-05-17T12:00:00Z"),
      exists: () => true,
      stat: () => ({ mtime: new Date("2026-05-17T11:30:00Z") }) as never,
      countDocs: () => 1,
      hasTool: (tool) => tool !== "python3",
    });
    expect(health.sources[0]).toMatchObject({
      id: "spark",
      status: "degraded",
      lastError: expect.stringContaining("missing tool: python3"),
    });
  });

  it("requireFreshContextSources returns ok for healthy required sources", () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const health = evaluateContextSources(config(), {
      now,
      exists: (target) => target.endsWith("spark"),
      stat: () => ({ mtime: new Date("2026-05-17T11:30:00Z") }) as never,
      countDocs: () => 2,
      hasTool: () => true,
    });
    expect(requireFreshContextSources(health, ["spark"])).toEqual({ ok: true });
  });

  it("deepMergeConfigs overlays local fields and appends new source ids", () => {
    const base: ContextSourcesConfig = {
      sources: [{ ...config().sources[0], enabled: false }],
    };
    const local: ContextSourcesConfig = {
      sources: [
        { id: "spark", enabled: true },
        {
          id: "extra",
          type: "local-folder",
          enabled: true,
          requiredTools: [],
          envVars: [],
          sourcePath: "./extra",
          ingestCommand: null,
          indexCommand: null,
          freshnessThresholdMinutes: 30,
          qmdCollection: null,
          safeAnswerPolicy: "optional",
        },
      ],
    };
    const merged = deepMergeConfigs(base, local);
    expect(merged.sources).toHaveLength(2);
    expect(merged.sources[0].enabled).toBe(true);
    expect(merged.sources[0].ingestCommand).toBe("spark ingest");
    expect(merged.sources[1].id).toBe("extra");
  });

  it("defaultCountDocs counts nested markdown files on disk", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-docs-"));
    const nested = path.join(dir, "nested");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(dir, "readme.md"), "# hi");
    fs.writeFileSync(path.join(nested, "note.txt"), "text");
    fs.writeFileSync(path.join(nested, "ignore.bin"), "bin");

    const health = evaluateContextSources(
      {
        sources: [
          {
            id: "local",
            type: "local-folder",
            enabled: true,
            requiredTools: [],
            envVars: [],
            sourcePath: dir,
            ingestCommand: null,
            indexCommand: null,
            freshnessThresholdMinutes: 10_000,
            qmdCollection: null,
            safeAnswerPolicy: "optional",
          },
        ],
      },
      { now: new Date("2026-05-17T12:00:00Z") }
    );
    expect(health.sources[0].documentCount).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
