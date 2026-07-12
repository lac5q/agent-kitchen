/**
 * Minimal Node.js ESM resolver that maps extensionless and .js relative
 * imports inside the MemroOS TS source tree to .ts files. Used by the
 * comparative retrieval benchmark CLI runner to invoke the TypeScript
 * retrieval-bench module under Node 22's --experimental-strip-types.
 *
 * NOT a general-purpose loader — only handles the patterns used by the
 * benchmark module. Resolves bare specifiers via standard ESM resolution
 * to avoid breaking Node built-ins or npm deps.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const TS_SOURCE_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
  "apps/memroos/src",
);

export function resolve(specifier, context, nextResolve) {
  // Skip anything that doesn't look like a relative path or absolute path.
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative) {
    return nextResolve(specifier, context);
  }
  const parentURL = context.parentURL;
  if (!parentURL) {
    return nextResolve(specifier, context);
  }
  const parentPath = fileURLToPath(parentURL);
  // Only handle .ts files inside the TS source tree.
  if (!parentPath.includes(TS_SOURCE_ROOT)) {
    return nextResolve(specifier, context);
  }
  // If the specifier already has a .ts extension, let Node handle it.
  if (specifier.endsWith(".ts") || specifier.endsWith(".js") || specifier.endsWith(".mjs")) {
    return nextResolve(specifier, context);
  }
  const basePath = path.resolve(path.dirname(parentPath), specifier);
  const candidates = [
    basePath + ".ts",
    basePath + "/index.ts",
    basePath,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      const idx = path.join(candidate, "index.ts");
      if (existsSync(idx)) {
        return nextResolve(pathToFileURL(idx).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
