import { apiError } from "@/lib/api-error";
import {
  getWikiRoot,
  listWikiTree,
  readWikiPage,
  searchWikiPages,
  wikiRootExists,
} from "@/lib/wiki-vault";
import { loadWikiGraph } from "@/lib/wiki-graph";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "tree";
    const knowledgeBasePath = url.searchParams.get("knowledgeBasePath") ?? undefined;
    const wikiRoot = getWikiRoot({ knowledgeBasePath });

    if (view === "status") {
      return Response.json({
        ok: true,
        wikiRoot,
        exists: wikiRootExists(wikiRoot),
      });
    }

    if (!wikiRootExists(wikiRoot)) {
      return Response.json({
        ok: true,
        exists: false,
        wikiRoot,
        tree: [],
        page: null,
        hits: [],
        graph: { exists: false, nodes: [], edges: [], reason: "wiki_root_missing" },
      });
    }

    if (view === "page") {
      const pagePath = url.searchParams.get("path") ?? "index.md";
      const page = readWikiPage(wikiRoot, pagePath);
      if (!page) {
        return Response.json({ ok: false, error: "page_not_found", path: pagePath }, { status: 404 });
      }
      return Response.json({ ok: true, exists: true, wikiRoot, page });
    }

    if (view === "search") {
      const q = url.searchParams.get("q") ?? "";
      const hits = searchWikiPages(wikiRoot, q);
      return Response.json({ ok: true, exists: true, wikiRoot, hits });
    }

    if (view === "graph") {
      const graph = loadWikiGraph({ wikiRoot });
      return Response.json({ ok: true, exists: wikiRootExists(wikiRoot), wikiRoot, graph });
    }

    const tree = listWikiTree(wikiRoot);
    return Response.json({ ok: true, exists: true, wikiRoot, tree });
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : String(err));
  }
}
