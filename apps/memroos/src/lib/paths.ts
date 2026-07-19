import fs from "fs";
import path from "path";

// On macOS, `process.cwd()` and `fs.realpathSync` report `/private/var/folders/...`
// for the user tmp dir, while `os.tmpdir()` returns the unprefixed `/var/folders/...`.
// Stripping `/private` here keeps `getRepoRoot()` symmetric with `os.tmpdir()`,
// so test fixtures (built from `os.tmpdir()`) and runtime lookups (built from
// `process.cwd()`) resolve to the same logical path regardless of source. No-op on
// Linux/Windows and on absolute paths that don't start with the macOS private prefix.
function normalizePlatformPath(value: string): string {
  if (process.platform !== "darwin") return value;
  if (value.startsWith("/private/")) return value.slice("/private".length);
  return value;
}

export function getRepoRoot(): string {
  if (process.env.MEMROOS_ROOT) {
    return path.resolve(process.env.MEMROOS_ROOT);
  }

  const cwd = process.cwd();
  if (path.basename(cwd) === "memroos" && path.basename(path.dirname(cwd)) === "apps") {
    return normalizePlatformPath(path.resolve(/* turbopackIgnore: true */ cwd, "../.."));
  }

  return normalizePlatformPath(cwd);
}

export function resolveFromRepoRoot(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments);
}

export function findConfigFile(filename: string): string {
  const rootPath = resolveFromRepoRoot(filename);
  if (fs.existsSync(rootPath)) return rootPath;
  // Always normalize the cwd fallback so callers downstream see a canonical path
  // and don't get tripped by the macOS `/private/var/folders` vs `/var/folders`
  // symlink discrepancy.
  return normalizePlatformPath(path.join(process.cwd(), filename));
}
