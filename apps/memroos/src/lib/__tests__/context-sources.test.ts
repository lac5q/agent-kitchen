// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  deepMergeConfigs,
  evaluateContextSources,
  loadContextSourceContracts,
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
      {
        id: "gmail",
        type: "gmail",
        enabled: false,
        requiredTools: [],
        envVars: [],
        sourcePath: "./gmail",
        ingestCommand: null,
        indexCommand: null,
        freshnessThresholdMinutes: 60,
        qmdCollection: "gmail",
        safeAnswerPolicy: "source_required",
      },
    ],
  };
}

describe("context source contracts", () => {
  it("reports ok, stale, missing, degraded, and disabled states", () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const health = evaluateContextSources(config(), {
      now,
      exists: (target) => target.endsWith("spark"),
      stat: () => ({ mtime: new Date("2026-05-17T11:30:00Z") }) as never,
      countDocs: () => 3,
      hasTool: () => true,
    });

    expect(health.sources[0]).toMatchObject({ id: "spark", status: "ok", documentCount: 3, ageMinutes: 30 });
    expect(health.sources[1]).toMatchObject({ id: "gmail", status: "disabled" });
  });

  it("marks enabled missing paths as SOURCE_MISSING for safe-answer gates", () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const health = evaluateContextSources(config(), {
      now,
      exists: () => false,
      hasTool: () => true,
    });

    expect(health.sources[0]).toMatchObject({ id: "spark", status: "missing" });
    expect(requireFreshContextSources(health, ["spark"])).toMatchObject({
      ok: false,
      code: "SOURCE_MISSING",
      sourceId: "spark",
    });
  });

  it("marks stale sources as SOURCE_STALE for source-backed tasks", () => {
    const now = new Date("2026-05-17T12:00:00Z");
    const health = evaluateContextSources(config(), {
      now,
      exists: () => true,
      stat: () => ({ mtime: new Date("2026-05-17T08:00:00Z") }) as never,
      countDocs: () => 10,
      hasTool: () => true,
    });

    expect(health.sources[0]).toMatchObject({ id: "spark", status: "stale" });
    expect(requireFreshContextSources(health, ["spark"])).toMatchObject({
      ok: false,
      code: "SOURCE_STALE",
      sourceId: "spark",
    });
  });

  it("loads contracts from CONTEXT_SOURCES_CONFIG when configured", () => {
    const previous = process.env.CONTEXT_SOURCES_CONFIG;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-context-sources-"));
    const target = path.join(dir, "context-sources.json");
    fs.writeFileSync(target, JSON.stringify({ sources: [{ ...config().sources[0], id: "custom-qmd" }] }));
    process.env.CONTEXT_SOURCES_CONFIG = target;

    try {
      expect(loadContextSourceContracts().sources[0].id).toBe("custom-qmd");
    } finally {
      if (previous == null) delete process.env.CONTEXT_SOURCES_CONFIG;
      else process.env.CONTEXT_SOURCES_CONFIG = previous;
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe("local config overlay", () => {
  const baseSource = {
    id: "spark",
    type: "spark" as const,
    enabled: false,
    requiredTools: ["python3"],
    envVars: [],
    sourcePath: "./spark",
    ingestCommand: "spark ingest",
    indexCommand: "qmd index spark",
    freshnessThresholdMinutes: 60,
    qmdCollection: "spark",
    safeAnswerPolicy: "source_required" as const,
  };

  function writeBaseConfig(dir: string): string {
    const target = path.join(dir, "base-config.json");
    fs.writeFileSync(target, JSON.stringify({ sources: [baseSource] }));
    return target;
  }

  it("passes through base config unchanged when no local file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-overlay-"));
    const baseFile = writeBaseConfig(dir);
    const missingLocalPath = path.join(dir, "definitely-not-there.json");

    const prevConfig = process.env.CONTEXT_SOURCES_CONFIG;
    const prevLocal = process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
    process.env.CONTEXT_SOURCES_CONFIG = baseFile;
    process.env.CONTEXT_SOURCES_LOCAL_CONFIG = missingLocalPath;

    try {
      const result = loadContextSourceContracts();
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]).toMatchObject({ id: "spark", enabled: false });
    } finally {
      if (prevConfig == null) delete process.env.CONTEXT_SOURCES_CONFIG;
      else process.env.CONTEXT_SOURCES_CONFIG = prevConfig;
      if (prevLocal == null) delete process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
      else process.env.CONTEXT_SOURCES_LOCAL_CONFIG = prevLocal;
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("merges local override: overrides specified field, preserves unmentioned fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-overlay-"));
    const baseFile = writeBaseConfig(dir);
    const localFile = path.join(dir, "local.json");
    fs.writeFileSync(localFile, JSON.stringify({ sources: [{ id: "spark", enabled: true }] }));

    const prevConfig = process.env.CONTEXT_SOURCES_CONFIG;
    const prevLocal = process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
    process.env.CONTEXT_SOURCES_CONFIG = baseFile;
    process.env.CONTEXT_SOURCES_LOCAL_CONFIG = localFile;

    try {
      const result = loadContextSourceContracts();
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].enabled).toBe(true);
      // unmentioned fields from base must be preserved
      expect(result.sources[0].ingestCommand).toBe("spark ingest");
      expect(result.sources[0].freshnessThresholdMinutes).toBe(60);
    } finally {
      if (prevConfig == null) delete process.env.CONTEXT_SOURCES_CONFIG;
      else process.env.CONTEXT_SOURCES_CONFIG = prevConfig;
      if (prevLocal == null) delete process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
      else process.env.CONTEXT_SOURCES_LOCAL_CONFIG = prevLocal;
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("appends new source id from local override to merged result", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-overlay-"));
    const baseFile = writeBaseConfig(dir);
    const newSource = {
      id: "meet-recordings",
      type: "qmd" as const,
      enabled: true,
      requiredTools: [],
      envVars: ["MEETINGS_INGEST_COMMAND"],
      sourcePath: "./data/context/meet-recordings",
      ingestCommand: "${MEETINGS_INGEST_COMMAND}",
      indexCommand: "qmd index meet-recordings",
      freshnessThresholdMinutes: 360,
      qmdCollection: "meet-recordings",
      safeAnswerPolicy: "source_required" as const,
    };
    const localFile = path.join(dir, "local.json");
    fs.writeFileSync(localFile, JSON.stringify({ sources: [newSource] }));

    const prevConfig = process.env.CONTEXT_SOURCES_CONFIG;
    const prevLocal = process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
    process.env.CONTEXT_SOURCES_CONFIG = baseFile;
    process.env.CONTEXT_SOURCES_LOCAL_CONFIG = localFile;

    try {
      const result = loadContextSourceContracts();
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].id).toBe("spark");
      expect(result.sources[1].id).toBe("meet-recordings");
    } finally {
      if (prevConfig == null) delete process.env.CONTEXT_SOURCES_CONFIG;
      else process.env.CONTEXT_SOURCES_CONFIG = prevConfig;
      if (prevLocal == null) delete process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
      else process.env.CONTEXT_SOURCES_LOCAL_CONFIG = prevLocal;
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("respects CONTEXT_SOURCES_LOCAL_CONFIG env var path instead of default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-overlay-"));
    const baseFile = writeBaseConfig(dir);
    const customLocalFile = path.join(dir, "my-custom-local.json");
    fs.writeFileSync(customLocalFile, JSON.stringify({ sources: [{ id: "spark", enabled: true }] }));

    const prevConfig = process.env.CONTEXT_SOURCES_CONFIG;
    const prevLocal = process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
    process.env.CONTEXT_SOURCES_CONFIG = baseFile;
    process.env.CONTEXT_SOURCES_LOCAL_CONFIG = customLocalFile;

    try {
      const result = loadContextSourceContracts();
      // env var path was used; spark.enabled should be overridden to true
      expect(result.sources[0].enabled).toBe(true);
    } finally {
      if (prevConfig == null) delete process.env.CONTEXT_SOURCES_CONFIG;
      else process.env.CONTEXT_SOURCES_CONFIG = prevConfig;
      if (prevLocal == null) delete process.env.CONTEXT_SOURCES_LOCAL_CONFIG;
      else process.env.CONTEXT_SOURCES_LOCAL_CONFIG = prevLocal;
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });
});
