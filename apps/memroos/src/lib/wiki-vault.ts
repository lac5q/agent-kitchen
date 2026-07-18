/**
 * Read-only helpers for the MemRoOS human wiki vault under KNOWLEDGE_BASE_PATH.
 *
 * Default root: `${KNOWLEDGE_BASE_PATH}/llm-wiki/wiki`
 */
import fs from "node:fs";
import path from "node:path";

import { loadMemroosEnv } from "@/lib/env";

export const WIKI_SUBDIR = path.join("llm-wiki", "wiki");

export interface WikiTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: WikiTreeNode[];
}

export interface WikiPage {
  path: string;
  title: string;
  content: string;
  mtime: string | null;
}

export interface WikiSearchHit {
  path: string;
  title: string;
  snippet: string;
}

export function getKnowledgeBasePath(override?: string): string {
  if (override && override.trim()) return path.resolve(override.trim());
  return path.resolve(loadMemroosEnv().KNOWLEDGE_BASE_PATH);
}

export function getWikiRoot(options: { knowledgeBasePath?: string; wikiRoot?: string } = {}): string {
  if (options.wikiRoot && options.wikiRoot.trim()) {
    return path.resolve(options.wikiRoot.trim());
  }
  return path.join(getKnowledgeBasePath(options.knowledgeBasePath), WIKI_SUBDIR);
}

export function wikiRootExists(wikiRoot: string): boolean {
  try {
    return fs.statSync(wikiRoot).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve a vault-relative path safely (no traversal outside wiki root). */
export function resolveWikiPath(wikiRoot: string, relativePath = ""): string | null {
  const root = path.resolve(wikiRoot);
  const cleaned = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

function titleFromContent(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading?.[1]?.trim()) return heading[1].trim();
  return fallback.replace(/\.md$/i, "").replace(/[-_]/g, " ");
}

export function listWikiTree(wikiRoot: string, maxDepth = 6): WikiTreeNode[] {
  if (!wikiRootExists(wikiRoot)) return [];

  function walk(dir: string, rel: string, depth: number): WikiTreeNode[] {
    if (depth > maxDepth) return [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: WikiTreeNode[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: childRel,
          type: "dir",
          children: walk(full, childRel, depth + 1),
        });
      } else if (entry.isFile() && /\.(md|mdx|txt)$/i.test(entry.name)) {
        nodes.push({ name: entry.name, path: childRel, type: "file" });
      }
    }
    return nodes;
  }

  return walk(wikiRoot, "", 0);
}

export function readWikiPage(wikiRoot: string, relativePath: string): WikiPage | null {
  const resolved = resolveWikiPath(wikiRoot, relativePath);
  if (!resolved) return null;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;
    const content = fs.readFileSync(resolved, "utf8");
    return {
      path: relativePath.replace(/\\/g, "/"),
      title: titleFromContent(content, path.basename(relativePath)),
      content,
      mtime: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

/** Extract [[wikilink]] targets (optionally with alias). */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const target = match[1]?.trim();
    if (target) links.push(target);
  }
  return links;
}

/**
 * Resolve a wikilink target to a vault-relative .md path when possible.
 * Tries exact path, path.md, and basename search under wiki root.
 */
export function resolveWikilink(wikiRoot: string, target: string): string | null {
  const cleaned = target.trim().replace(/^\/+/, "");
  if (!cleaned) return null;

  const candidates = [
    cleaned,
    cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`,
  ];
  for (const candidate of candidates) {
    const resolved = resolveWikiPath(wikiRoot, candidate);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return candidate.replace(/\\/g, "/");
    }
  }

  const needle = path.basename(cleaned).replace(/\.md$/i, "").toLowerCase();
  const stack = [wikiRoot];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.md$/i.test(entry.name)) continue;
      const base = entry.name.replace(/\.md$/i, "").toLowerCase();
      if (base === needle) {
        return path.relative(wikiRoot, full).split(path.sep).join("/");
      }
    }
  }
  return null;
}

export function searchWikiPages(
  wikiRoot: string,
  query: string,
  limit = 25
): WikiSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q || !wikiRootExists(wikiRoot)) return [];

  const hits: WikiSearchHit[] = [];
  const stack = [wikiRoot];
  while (stack.length && hits.length < limit) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(md|mdx|txt)$/i.test(entry.name)) continue;
      let content: string;
      try {
        content = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const rel = path.relative(wikiRoot, full).split(path.sep).join("/");
      const title = titleFromContent(content, entry.name);
      const hay = `${title}\n${content}`.toLowerCase();
      const idx = hay.indexOf(q);
      if (idx < 0) continue;
      const start = Math.max(0, idx - 40);
      const snippet = content.slice(start, start + 120).replace(/\s+/g, " ").trim();
      hits.push({ path: rel, title, snippet });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
