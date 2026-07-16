// @vitest-environment node
/**
 * ONTO-01 — git upper ontology source stays locked to CORE_VOCABULARY.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { load as loadYaml } from "js-yaml";

import {
  CORE_RELATIONSHIPS,
  CORE_VOCABULARY,
  UPPER_ONTOLOGY_ID,
  UPPER_ONTOLOGY_SOURCE,
} from "../registry";
import { resolveFromRepoRoot } from "@/lib/paths";

describe("upper ontology git source (ONTO-01)", () => {
  it("content/ontology/upper.yaml mirrors CORE_VOCABULARY and CORE_RELATIONSHIPS", () => {
    const filePath = resolveFromRepoRoot(...UPPER_ONTOLOGY_SOURCE.split("/"));
    expect(fs.existsSync(filePath)).toBe(true);
    const doc = loadYaml(fs.readFileSync(filePath, "utf8")) as {
      id: string;
      version: string;
      definitions: Array<{ id: string; aliases?: string[]; semantics: Record<string, unknown> }>;
      relationships: Array<{ from: string; to: string; type: string }>;
    };
    expect(doc.id).toBe(UPPER_ONTOLOGY_ID);
    expect(doc.version).toBe("1.0.0");
    expect(doc.definitions).toEqual([...CORE_VOCABULARY]);
    expect(doc.relationships).toEqual([...CORE_RELATIONSHIPS]);
    expect(path.basename(path.dirname(filePath))).toBe("ontology");
  });
});
