// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildOkfBundle,
  buildOkfConceptFromMemory,
  parseOkfDocument,
  validateOkfBundle,
} from "@/lib/okf";
import type { MemoryEntry } from "@/types";

describe("OKF memory bundle support", () => {
  const memory: MemoryEntry = {
    id: "project/foo.md",
    content: "Remember to cite the [runbook](/runbooks/retry.md) before changing retry policy.",
    agent: "claude",
    date: "2026-06-13T18:00:00.000Z",
    type: "project",
    source: "/Users/luis/.claude/projects/foo/memory/foo.md",
  };

  it("maps a memory entry into a conformant OKF concept with MemRoOS extension fields", () => {
    const concept = buildOkfConceptFromMemory(memory, {
      tags: ["memory", "project"],
      securityLabel: "internal",
      provenanceHash: "sha256:abc",
    });

    expect(concept.path).toBe("memory/project/foo.md");
    expect(concept.frontmatter).toMatchObject({
      type: "Memory Entry",
      title: "project/foo.md",
      tags: ["memory", "project"],
      timestamp: "2026-06-13T18:00:00.000Z",
      memroos_id: "project/foo.md",
      agent_id: "claude",
      source_type: "claude",
      security_label: "internal",
      provenance_hash: "sha256:abc",
    });
    expect(parseOkfDocument(concept.content).frontmatter.type).toBe("Memory Entry");
  });

  it("builds a bundle with root index, update log, and concept documents", () => {
    const concept = buildOkfConceptFromMemory(memory);
    const bundle = buildOkfBundle({
      name: "MemRoOS sample",
      concepts: [concept],
      timestamp: "2026-06-13T19:00:00.000Z",
    });

    expect(bundle["index.md"]).toContain("# MemRoOS sample");
    expect(bundle["index.md"]).toContain("[project/foo.md](memory/project/foo.md)");
    expect(bundle["log.md"]).toContain("## 2026-06-13");
    expect(bundle["memory/project/foo.md"]).toBe(concept.content);
  });

  it("validates required type frontmatter and reports broken links without failing conformance", () => {
    const concept = buildOkfConceptFromMemory(memory);
    const bundle = buildOkfBundle({
      name: "MemRoOS sample",
      concepts: [
        concept,
        {
          path: "bad/missing-type.md",
          frontmatter: { title: "Missing type" },
          body: "No type here.",
          content: "---\ntitle: Missing type\n---\nNo type here.",
        },
      ],
    });

    const validation = validateOkfBundle(bundle);

    expect(validation.conformant).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "bad/missing-type.md",
          code: "missing_type",
        }),
      ])
    );
    expect(validation.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "memory/project/foo.md",
          code: "broken_link",
          target: "runbooks/retry.md",
        }),
      ])
    );
  });
});
