import { readFileSync } from "fs";
import { readdir, stat } from "fs/promises";
import path from "path";
import type { KnowledgeCollection } from "@/types";

export const dynamic = "force-dynamic";

function loadCollections(): { name: string; category: KnowledgeCollection["category"]; basePath?: string }[] {
  const configPath =
    process.env.COLLECTIONS_CONFIG_PATH ||
    path.join(process.cwd(), "collections.config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    return config.collections ?? [];
  } catch {
    // Fallback: return empty (no collections configured)
    return [];
  }
}

const KNOWLEDGE_BASE =
  process.env.KNOWLEDGE_BASE_PATH ||
  `${process.env.HOME}/github/knowledge`;

export async function GET() {
  const COLLECTIONS = loadCollections();
  const collections: KnowledgeCollection[] = [];

  for (const col of COLLECTIONS) {
    const colPath = col.basePath ?? path.join(KNOWLEDGE_BASE, col.name);
    try {
      const files = await readdir(colPath, { recursive: true });
      const mdFiles = (files as string[]).filter((f) => f.endsWith(".md"));
      let lastUpdated: Date | null = null;
      const sample = mdFiles.slice(0, 5);
      for (const f of sample) {
        const fStat = await stat(path.join(colPath, f)).catch(() => null);
        if (fStat && (!lastUpdated || fStat.mtime > lastUpdated)) {
          lastUpdated = fStat.mtime;
        }
      }
      collections.push({
        name: col.name,
        docCount: mdFiles.length,
        category: col.category,
        lastUpdated: lastUpdated?.toISOString() || null,
      });
    } catch {
      collections.push({
        name: col.name,
        docCount: 0,
        category: col.category,
        lastUpdated: null,
      });
    }
  }

  const totalDocs = collections.reduce((sum, c) => sum + c.docCount, 0);

  return Response.json({
    collections: collections.sort((a, b) => b.docCount - a.docCount),
    totalDocs,
    totalCollections: collections.length,
    timestamp: new Date().toISOString(),
  });
}
