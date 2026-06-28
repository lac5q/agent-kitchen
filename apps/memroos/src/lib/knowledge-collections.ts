import { readFileSync } from "fs";
import { readdir, stat } from "fs/promises";
import path from "path";
import type { KnowledgeCollection } from "@/types";
import { findConfigFile } from "@/lib/paths";
import { loadMemroosEnv } from "@/lib/env";

export type CollectionConfig = {
  name: string;
  category: KnowledgeCollection["category"];
  /** Legacy single-source path, relative to KNOWLEDGE_BASE_PATH unless absolute. */
  basePath?: string;
  /** Multiple source paths for one logical collection, relative to KNOWLEDGE_BASE_PATH unless absolute. */
  basePaths?: string[];
};

export const KNOWLEDGE_FILE_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);

export function loadCollections(): CollectionConfig[] {
  const configuredPath = loadMemroosEnv().COLLECTIONS_CONFIG_PATH;
  const configPath = path.isAbsolute(configuredPath) ? configuredPath : findConfigFile(configuredPath);
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as { collections?: CollectionConfig[] };
    return config.collections ?? [];
  } catch {
    return [];
  }
}

export function getKnowledgeBasePath() {
  return loadMemroosEnv().KNOWLEDGE_BASE_PATH;
}

function resolveBasePath(basePath: string) {
  return path.isAbsolute(basePath) ? basePath : path.join(getKnowledgeBasePath(), basePath);
}

export function resolveCollectionPaths(col: { name: string; basePath?: string; basePaths?: string[] }) {
  const basePaths = col.basePaths?.length ? col.basePaths : [col.basePath ?? col.name];
  return basePaths.map(resolveBasePath);
}

export function resolveCollectionPath(col: { name: string; basePath?: string; basePaths?: string[] }) {
  return resolveCollectionPaths(col)[0];
}

export function isKnowledgeFile(filePath: string) {
  return KNOWLEDGE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function collectKnowledgeFiles(collectionPath: string): Promise<Array<{ path: string; mtime: Date }>> {
  const files: Array<{ path: string; mtime: Date }> = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !isKnowledgeFile(entry.name)) continue;
      const fStat = await stat(entryPath).catch(() => null);
      if (fStat) files.push({ path: entryPath, mtime: fStat.mtime });
    }
  }

  await walk(collectionPath);
  return files;
}

export async function scanCollection(collectionPath: string): Promise<{ docCount: number; lastUpdated: Date | null }> {
  const files = await collectKnowledgeFiles(collectionPath);
  const lastUpdated = files.reduce<Date | null>(
    (latest, file) => (!latest || file.mtime > latest ? file.mtime : latest),
    null
  );
  return { docCount: files.length, lastUpdated };
}

export async function collectCollectionFiles(col: CollectionConfig): Promise<Array<{ path: string; mtime: Date }>> {
  const byPath = new Map<string, { path: string; mtime: Date }>();

  for (const collectionPath of resolveCollectionPaths(col)) {
    try {
      const files = await collectKnowledgeFiles(collectionPath);
      for (const file of files) byPath.set(file.path, file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw error;
    }
  }

  return Array.from(byPath.values());
}

export async function scanConfiguredCollection(col: CollectionConfig): Promise<{ docCount: number; lastUpdated: Date | null }> {
  const files = await collectCollectionFiles(col);
  const lastUpdated = files.reduce<Date | null>(
    (latest, file) => (!latest || file.mtime > latest ? file.mtime : latest),
    null
  );
  return { docCount: files.length, lastUpdated };
}
