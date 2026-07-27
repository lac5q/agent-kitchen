import fs from "fs";
import path from "path";

export function getRepoRoot(): string {
  if (process.env.MEMROOS_ROOT) {
    return path.resolve(process.env.MEMROOS_ROOT);
  }

  const cwd = process.cwd();
  if (path.basename(cwd) === "memroos" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(/* turbopackIgnore: true */ cwd, "../..");
  }

  return cwd;
}

export function resolveFromRepoRoot(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments);
}

export function findConfigFile(filename: string): string {
  const rootPath = resolveFromRepoRoot(filename);
  if (fs.existsSync(rootPath)) return rootPath;
  return path.join(process.cwd(), filename);
}
