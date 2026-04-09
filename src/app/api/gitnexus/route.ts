import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const GITNEXUS_REGISTRY = process.env.GITNEXUS_REGISTRY || `${process.env.HOME}/.gitnexus/registry.json`;

interface GitNexusRepo {
  name: string;
  path: string;
  files: number;
  symbols: number;
  edges: number;
  clusters: number;
  processes: number;
  lastIndexed: string | null;
}

export async function GET() {
  let repos: GitNexusRepo[] = [];

  try {
    const registry = JSON.parse(await readFile(GITNEXUS_REGISTRY, "utf-8"));

    // Registry is an object of { repoPath: { name, path, ... } }
    // or an array — handle both
    const entries = Array.isArray(registry) ? registry : Object.values(registry);

    for (const entry of entries as Record<string, unknown>[]) {
      const repoPath = (entry.path || entry.repoPath || entry.root) as string;
      if (!repoPath) continue;

      // Try to read per-repo meta.json
      let meta: Record<string, unknown> = {};
      try {
        const metaPath = path.join(repoPath, ".gitnexus", "meta.json");
        meta = JSON.parse(await readFile(metaPath, "utf-8"));
      } catch { /* no meta */ }

      const name = (entry.name as string) || path.basename(repoPath);
      repos.push({
        name,
        path: repoPath,
        files: (meta.files as number) || (meta.fileCount as number) || 0,
        symbols: (meta.symbols as number) || (meta.symbolCount as number) || 0,
        edges: (meta.edges as number) || (meta.edgeCount as number) || 0,
        clusters: (meta.clusters as number) || (meta.clusterCount as number) || 0,
        processes: (meta.processes as number) || (meta.processCount as number) || 0,
        lastIndexed: (meta.timestamp as string) || (meta.indexedAt as string) || null,
      });
    }
  } catch {
    // Registry not found or malformed
  }

  // Sort by symbols descending
  repos.sort((a, b) => b.symbols - a.symbols);

  return NextResponse.json({ repos, timestamp: new Date().toISOString() });
}
