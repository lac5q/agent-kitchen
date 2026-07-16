// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { NATIVE_MEMORY_SINK_POLICY } from "@/lib/native-memory/sink";
import { getRepoRoot } from "@/lib/paths";

describe("Hermes dual-mode memory contract (ENTOPS-07 opt-in)", () => {
  it("documents hermes observe opt-in without Claude/Codex claims", () => {
    expect(NATIVE_MEMORY_SINK_POLICY.harnessWiring).toBe("hermes_observe_opt_in");
    expect(NATIVE_MEMORY_SINK_POLICY.neverDelete).toBe(true);
  });

  it("ships Hermes plugin + installer + docs in repo", () => {
    const repo = getRepoRoot();
    const required = [
      "integrations/hermes/plugins/memory/memroos/__init__.py",
      "integrations/hermes/plugins/memory/memroos/plugin.yaml",
      "integrations/hermes/plugins/memory/memroos/README.md",
      "scripts/install-hermes-memroos-memory.sh",
      "docs/integrations/hermes-memory-dual-mode.md",
      ".planning/goals/2026-07-16-hermes-dual-mode-memory.md",
    ];
    for (const rel of required) {
      expect(fs.existsSync(path.join(repo, rel)), rel).toBe(true);
    }
  });

  it("plugin source never write()-targets MEMORY.md", () => {
    const repo = getRepoRoot();
    const init = fs.readFileSync(
      path.join(repo, "integrations/hermes/plugins/memory/memroos/__init__.py"),
      "utf8"
    );
    expect(init).toMatch(/rewrite_local["']?:\s*False/);
    expect(init).toContain("fail-open");
    expect(init).not.toMatch(/open\(\s*["']MEMORY\.md["']/);
    expect(init).not.toMatch(/memories\/MEMORY\.md/);
  });

  it("docs state Voyage is cloud API not local Mac model", () => {
    const repo = getRepoRoot();
    const doc = fs.readFileSync(
      path.join(repo, "docs/integrations/hermes-memory-dual-mode.md"),
      "utf8"
    );
    expect(doc.toLowerCase()).toContain("cloud http");
    expect(doc).toMatch(/not on your Mac/i);
  });
});
