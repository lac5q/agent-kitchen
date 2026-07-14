/**
 * Minimal Node.js ESM resolver for the MemroOS TypeScript source tree.
 *
 * Used by the comparative retrieval benchmark CLI runner to invoke the
 * TypeScript retrieval-bench module under Node 22's `--experimental-strip-types`.
 *
 * Handles three patterns used inside `apps/memroos/src`:
 *   1. Bare `@/*` aliases (e.g. `@/lib/audit/write`) — mapped to
 *      `apps/memroos/src/*` per the app's tsconfig.json `paths` entry.
 *   2. Relative `./...` / `../...` imports that resolve to `.ts`
 *      files (extensionless or `.js` -> `.ts`).
 *   3. Bare specifiers for npm deps and Node built-ins — passed through
 *      to standard ESM resolution to avoid breaking anything.
 *
 * NOT a general-purpose loader. Only handles the patterns used by the
 * benchmark module.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TS_SOURCE_ROOT = path.join(REPO_ROOT, "apps/memroos/src");

function resolveTsFile(basePath) {
  const candidates = [
    basePath + ".ts",
    basePath + "/index.ts",
    basePath,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      const idx = path.join(candidate, "index.ts");
      if (existsSync(idx)) {
        return pathToFileURL(idx).href;
      }
    }
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // 1) `@/*` alias resolution: only valid inside the TS source tree.
  if (specifier.startsWith("@/")) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : "";
    if (parentPath.includes(TS_SOURCE_ROOT)) {
      const aliased = path.join(TS_SOURCE_ROOT, specifier.slice(2));
      const resolved = resolveTsFile(aliased);
      if (resolved) {
        return nextResolve(resolved, context);
      }
    }
    // Fall through to standard resolution so the failure mode is clear.
    return nextResolve(specifier, context);
  }

  // 2) Relative paths: only when caller is inside the TS source tree.
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative) {
    // 3) Bare specifier (npm deps, Node built-ins) — pass through.
    return nextResolve(specifier, context);
  }
  const parentURL = context.parentURL;
  if (!parentURL) {
    return nextResolve(specifier, context);
  }
  const parentPath = fileURLToPath(parentURL);
  if (!parentPath.includes(TS_SOURCE_ROOT)) {
    return nextResolve(specifier, context);
  }
  if (specifier.endsWith(".ts") || specifier.endsWith(".js") || specifier.endsWith(".mjs")) {
    return nextResolve(specifier, context);
  }
  const basePath = path.resolve(path.dirname(parentPath), specifier);
  const resolved = resolveTsFile(basePath);
  if (resolved) {
    return nextResolve(resolved, context);
  }
  return nextResolve(specifier, context);
}
