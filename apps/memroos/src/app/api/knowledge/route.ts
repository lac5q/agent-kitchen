import type { KnowledgeCollection } from "@/types";
import { apiError } from "@/lib/api-error";
import {
  loadCollections,
  resolveCollectionPaths,
  scanConfiguredCollection,
} from "@/lib/knowledge-collections";
import {
  metricEnvelope,
  type MetricEnvelope,
  type MetricScope,
} from "@/lib/metric-status";

export const dynamic = "force-dynamic";

interface KnowledgeCollectionWithMetric extends KnowledgeCollection {
  metric: MetricEnvelope<number | null>;
}

const SCOPE: MetricScope = { window: "all", workspace: "all" };

async function buildKnowledgeResponse() {
  const COLLECTIONS = loadCollections();
  const collections: KnowledgeCollectionWithMetric[] = [];

  for (const col of COLLECTIONS) {
    let docCount = 0;
    let lastUpdated: Date | null = null;
    let sourceError: string | null = null;
    try {
      const scanned = await scanConfiguredCollection(col);
      docCount = scanned.docCount;
      lastUpdated = scanned.lastUpdated;
    } catch (error) {
      sourceError = error instanceof Error ? error.message : "scan failed";
    }
    const lastUpdatedIso = lastUpdated?.toISOString() ?? null;
    let metric: MetricEnvelope<number | null>;
    if (sourceError) {
      metric = metricEnvelope<number | null>({
        value: null,
        status: "error",
        source: `qmd://${col.name}`,
        observedAt: lastUpdatedIso,
        scope: SCOPE,
        reason: sourceError,
      });
    } else if (docCount > 0) {
      metric = metricEnvelope<number | null>({
        value: docCount,
        status: "live",
        source: `qmd://${col.name}`,
        observedAt: lastUpdatedIso,
        scope: SCOPE,
        reason: `Counted ${docCount} file(s) for collection ${col.name}`,
      });
    } else {
      const hasSource = (() => {
        try {
          const paths = resolveCollectionPaths(col);
          return paths.length > 0;
        } catch {
          return false;
        }
      })();
      metric = metricEnvelope<number | null>({
        value: 0,
        status: hasSource ? "empty" : "unavailable",
        source: `qmd://${col.name}`,
        observedAt: lastUpdatedIso,
        scope: SCOPE,
        reason: hasSource
          ? `Collection ${col.name} is healthy but contains no markdown / mdx / txt files`
          : `Collection ${col.name} has no configured source paths`,
      });
    }
    collections.push({
      name: col.name,
      docCount,
      category: col.category,
      lastUpdated: lastUpdatedIso,
      metric,
    });
  }

  const totalFiles = collections.reduce((sum, c) => sum + c.docCount, 0);
  const totalCollections = collections.length;

  const totalCollectionsEnv = metricEnvelope<number | null>({
    value: totalCollections,
    status: totalCollections > 0 ? "live" : "unavailable",
    source: "qmd://collections",
    observedAt: new Date().toISOString(),
    scope: SCOPE,
    reason: totalCollections > 0 ? `Configured ${totalCollections} collection(s)` : "No QMD collections are configured",
  });
  const totalFilesEnv = metricEnvelope<number | null>({
    value: totalFiles,
    status: totalFiles > 0 ? "live" : "zero",
    source: "qmd://total-files",
    observedAt: new Date().toISOString(),
    scope: SCOPE,
    reason:
      totalFiles > 0
        ? `Sum of ${totalFiles} file(s) across ${totalCollections} collection(s)`
        : "No QMD files discovered in the configured collection list",
  });

  return Response.json({
    collections: collections.sort((a, b) => b.docCount - a.docCount),
    totalDocs: totalFiles,
    totalFiles,
    totalCollections,
    metrics: {
      totalFiles: totalFilesEnv,
      totalCollections: totalCollectionsEnv,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function GET() {
  try {
    return await buildKnowledgeResponse();
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
