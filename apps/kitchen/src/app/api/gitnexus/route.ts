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

      // Stats are nested under meta.stats (nodes/edges/communities/processes/files)
      // Fall back to registry entry's own stats field if meta.json lacks them
      const metaStats = (meta.stats || {}) as Record<string, unknown>;
      const entryStats = (entry.stats || {}) as Record<string, unknown>;

      const name = (entry.name as string) || path.basename(repoPath);
      repos.push({
        name,
        path: repoPath,
        files: (metaStats.files as number) || (entryStats.files as number) || (meta.files as number) || 0,
        symbols: (metaStats.nodes as number) || (entryStats.nodes as number) || (meta.symbols as number) || 0,
        edges: (metaStats.edges as number) || (entryStats.edges as number) || (meta.edges as number) || 0,
        clusters: (metaStats.communities as number) || (entryStats.communities as number) || (meta.clusters as number) || 0,
        processes: (metaStats.processes as number) || (entryStats.processes as number) || (meta.processes as number) || 0,
        lastIndexed: (meta.indexedAt as string) || (entry.indexedAt as string) || (meta.timestamp as string) || null,
      });
    }
  } catch {
    // Registry not found or malformed
  }

  // Sort by symbols descending
  repos.sort((a, b) => b.symbols - a.symbols);

  return NextResponse.json({ repos, timestamp: new Date().toISOString() });
}
