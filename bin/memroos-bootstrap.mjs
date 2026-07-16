/**
 * Bootstrap for bin/memroos.mjs — registers the MemRoOS ts-loader, then
 * loads the TypeScript CLI entry under --experimental-strip-types.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LOADER = path.join(REPO_ROOT, "scripts", "ts-loader.mjs");
const ENTRY = path.join(REPO_ROOT, "apps", "memroos", "src", "lib", "export", "cli.ts");

register(LOADER, pathToFileURL(path.join(REPO_ROOT, "scripts") + "/"));

const { runMemroosCli } = await import(pathToFileURL(ENTRY).href);
const code = await runMemroosCli(process.argv);
process.exit(code);
