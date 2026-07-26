// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("paths", () => {
  const originalCwd = process.cwd();
  const originalRoot = process.env.MEMROOS_ROOT;

  // On macOS os.tmpdir() is /var/... which is a symlink to /private/var/...
  // Any test that chdir()s into a temp dir gets the resolved path back from
  // process.cwd(), so compare against the real path rather than the symlink.
  const mkTmp = (prefix: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalRoot === undefined) {
      delete process.env.MEMROOS_ROOT;
    } else {
      process.env.MEMROOS_ROOT = originalRoot;
    }
    vi.resetModules();
  });

  it("getRepoRoot honors MEMROOS_ROOT", async () => {
    const customRoot = path.join(os.tmpdir(), "memroos-custom-root");
    process.env.MEMROOS_ROOT = customRoot;
    vi.resetModules();
    const { getRepoRoot } = await import("@/lib/paths");
    expect(getRepoRoot()).toBe(path.resolve(customRoot));
  });

  it("getRepoRoot walks up from apps/memroos cwd", async () => {
    delete process.env.MEMROOS_ROOT;
    const tmp = mkTmp("memroos-paths-");
    const appsMemroos = path.join(tmp, "apps", "memroos");
    fs.mkdirSync(appsMemroos, { recursive: true });
    process.chdir(appsMemroos);
    vi.resetModules();
    const { getRepoRoot } = await import("@/lib/paths");
    expect(getRepoRoot()).toBe(path.resolve(tmp));
  });

  it("getRepoRoot returns cwd when not under apps/memroos", async () => {
    delete process.env.MEMROOS_ROOT;
    const tmp = mkTmp("memroos-paths-other-");
    process.chdir(tmp);
    vi.resetModules();
    const { getRepoRoot } = await import("@/lib/paths");
    expect(getRepoRoot()).toBe(path.resolve(tmp));
  });

  it("resolveFromRepoRoot joins segments under repo root", async () => {
    process.env.MEMROOS_ROOT = "/repo";
    vi.resetModules();
    const { resolveFromRepoRoot } = await import("@/lib/paths");
    expect(resolveFromRepoRoot("apps", "memroos")).toBe(path.join("/repo", "apps", "memroos"));
  });

  it("findConfigFile prefers repo root when file exists", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-find-config-"));
    const configName = "agents.config.json";
    fs.writeFileSync(path.join(tmp, configName), "{}");
    process.env.MEMROOS_ROOT = tmp;
    vi.resetModules();
    const { findConfigFile } = await import("@/lib/paths");
    expect(findConfigFile(configName)).toBe(path.join(tmp, configName));
  });

  it("findConfigFile falls back to cwd when missing at root", async () => {
    const tmp = mkTmp("memroos-find-config-fb-");
    const sub = path.join(tmp, "sub");
    fs.mkdirSync(sub);
    const configName = "missing-at-root.json";
    fs.writeFileSync(path.join(sub, configName), "{}");
    process.env.MEMROOS_ROOT = tmp;
    process.chdir(sub);
    vi.resetModules();
    const { findConfigFile } = await import("@/lib/paths");
    expect(findConfigFile(configName)).toBe(path.join(sub, configName));
  });
});
