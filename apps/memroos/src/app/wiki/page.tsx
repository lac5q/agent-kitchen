"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";

interface WikiTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: WikiTreeNode[];
}

interface WikiPage {
  path: string;
  title: string;
  content: string;
  mtime: string | null;
}

interface WikiGraphPayload {
  exists: boolean;
  nodes: Array<{ id: string; label: string; path?: string }>;
  edges: Array<{ source: string; target: string }>;
  reason?: string;
}

function Tree({
  nodes,
  activePath,
  onOpen,
}: {
  nodes: WikiTreeNode[];
  activePath: string | null;
  onOpen: (path: string) => void;
}) {
  return (
    <ul className="space-y-1 text-sm">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === "dir" ? (
            <div>
              <div className="font-medium" style={{ color: NOC.soft }}>
                {node.name}/
              </div>
              <div className="ml-3 border-l border-white/10 pl-2">
                <Tree nodes={node.children ?? []} activePath={activePath} onOpen={onOpen} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(node.path)}
              className="block w-full rounded px-1 py-0.5 text-left hover:bg-white/5"
              style={{
                color: activePath === node.path ? NOC.terra : NOC.ink,
                background: activePath === node.path ? "rgba(255,255,255,0.06)" : undefined,
              }}
            >
              {node.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function rewriteWikilinks(markdown: string): string {
  return markdown.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_full, target: string, alias?: string) => {
      const label = (alias ?? target).trim();
      const hrefTarget = target.trim().replace(/\.md$/i, "");
      return `[${label}](/wiki?path=${encodeURIComponent(`${hrefTarget}.md`)})`;
    }
  );
}

export default function WikiPageView() {
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [exists, setExists] = useState(true);
  const [wikiRoot, setWikiRoot] = useState<string>("");
  const [page, setPage] = useState<WikiPage | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ path: string; title: string; snippet: string }>>([]);
  const [graph, setGraph] = useState<WikiGraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const initialPath = useMemo(() => {
    if (typeof window === "undefined") return "index.md";
    const params = new URLSearchParams(window.location.search);
    return params.get("path") || "index.md";
  }, []);

  const openPage = useCallback(async (pagePath: string) => {
    setError(null);
    const res = await fetch(`/api/wiki?view=page&path=${encodeURIComponent(pagePath)}`);
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setError(body.error ?? "page_not_found");
      setPage(null);
      return;
    }
    setPage(body.page);
    const url = new URL(window.location.href);
    url.searchParams.set("path", pagePath);
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [treeRes, graphRes] = await Promise.all([
          fetch("/api/wiki?view=tree"),
          fetch("/api/wiki?view=graph"),
        ]);
        const treeBody = await treeRes.json();
        const graphBody = await graphRes.json();
        if (cancelled) return;
        setExists(Boolean(treeBody.exists));
        setWikiRoot(String(treeBody.wikiRoot ?? ""));
        setTree(Array.isArray(treeBody.tree) ? treeBody.tree : []);
        setGraph(graphBody.graph ?? null);
        if (treeBody.exists) {
          await openPage(initialPath);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialPath, openPage]);

  async function runSearch() {
    const res = await fetch(`/api/wiki?view=search&q=${encodeURIComponent(query)}`);
    const body = await res.json();
    setHits(Array.isArray(body.hits) ? body.hits : []);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Memory"
        title="Wiki"
        hint="Read-only Obsidian-like browse of digested llm-wiki pages."
      />

      {!exists && (
        <div className="rounded border border-white/10 p-4 text-sm" style={{ color: NOC.muted }}>
          Wiki vault not found{wikiRoot ? ` at ${wikiRoot}` : ""}. Set{" "}
          <code>KNOWLEDGE_BASE_PATH</code> and run wiki digest, or open Obsidian on the knowledge vault.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/30 p-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(12rem,240px)_minmax(0,1fr)_minmax(12rem,220px)]">
        <aside className="rounded border border-white/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.soft }}>
            Pages
          </div>
          <Tree nodes={tree} activePath={page?.path ?? null} onOpen={(p) => void openPage(p)} />
        </aside>

        <section className="space-y-4 rounded border border-white/10 p-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search wiki…"
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              className="rounded border border-white/15 px-3 py-2 text-sm"
            >
              Search
            </button>
          </div>

          {hits.length > 0 && (
            <div className="space-y-2 text-sm">
              {hits.map((hit) => (
                <button
                  key={hit.path}
                  type="button"
                  className="block w-full rounded border border-white/10 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => void openPage(hit.path)}
                >
                  <div className="font-medium">{hit.title}</div>
                  <div style={{ color: NOC.muted }}>{hit.snippet}</div>
                </button>
              ))}
            </div>
          )}

          {page ? (
            <article className="prose prose-invert max-w-none">
              <h1>{page.title}</h1>
              <ReactMarkdown>{rewriteWikilinks(page.content)}</ReactMarkdown>
            </article>
          ) : (
            exists && (
              <div className="text-sm" style={{ color: NOC.muted }}>
                Select a page from the tree.
              </div>
            )
          )}
        </section>

        <aside className="rounded border border-white/10 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.soft }}>
            Graph
          </div>
          {!graph?.exists ? (
            <div className="text-xs" style={{ color: NOC.muted }}>
              {graph?.reason ?? "Graph unavailable"}
            </div>
          ) : (
            <ul className="space-y-1 text-sm">
              {graph.nodes.slice(0, 40).map((node) => (
                <li key={node.id}>
                  {node.path ? (
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => void openPage(node.path!)}
                    >
                      {node.label}
                    </button>
                  ) : (
                    <span>{node.label}</span>
                  )}
                </li>
              ))}
              {graph.edges.length > 0 && (
                <li className="pt-2 text-xs" style={{ color: NOC.muted }}>
                  {graph.edges.length} edge(s)
                </li>
              )}
            </ul>
          )}
          <div className="mt-4 text-xs" style={{ color: NOC.muted }}>
            <Link href="/library" className="underline">
              Knowledge library
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
