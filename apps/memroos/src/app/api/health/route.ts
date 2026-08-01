import { execFile } from "child_process";
import { stat as fsStat } from "fs/promises";
import path from "path";
import { MEM0_URL, AGENT_CONFIGS_PATH } from "@/lib/constants";
import { checkGraphHealth, mem0HealthTimeoutMs } from "@/lib/memory/backends";
import { getRepoRoot } from "@/lib/paths";
import type { HealthStatus } from "@/types";

export const dynamic = "force-dynamic";

function execFileStdout(
  file: string,
  args: string[],
  options: Parameters<typeof execFile>[2]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(typeof stdout === "string" ? stdout : stdout.toString("utf8"));
    });
  });
}

function execFileOutput(
  file: string,
  args: string[],
  options: Parameters<typeof execFile>[2]
): Promise<{ stdout: string; error: Error | null }> {
  return new Promise((resolve) => {
    execFile(file, args, options, (error, stdout) => {
      resolve({
        stdout: typeof stdout === "string" ? stdout : stdout.toString("utf8"),
        error: error instanceof Error ? error : null,
      });
    });
  });
}

type ServiceCheckResult = {
  status?: HealthStatus["status"];
  detail?: string;
};

type KnowledgeIndexReport = {
  ok?: boolean;
  pendingEmbeddings?: number | null;
  failures?: string[];
  warnings?: string[];
};

let knowledgeIndexCache:
  | { checkedAt: number; result: ServiceCheckResult }
  | null = null;
let knowledgeIndexInflight: Promise<ServiceCheckResult> | null = null;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function checkService(
  name: string,
  checkFn: () => Promise<void | ServiceCheckResult>
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const result = await checkFn();
    return {
      service: name,
      status: result?.status ?? "up",
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
      detail: result?.detail,
    };
  } catch (error) {
    return {
      service: name,
      status: "down",
      latencyMs: null,
      lastCheck: new Date().toISOString(),
      detail: error instanceof Error ? error.message : "health check failed",
    };
  }
}

async function checkMem0(): Promise<ServiceCheckResult> {
  // Share the vector-tier probe budget (default 15s, MEM0_HEALTH_TIMEOUT_MS) so
  // operator /api/health does not false-down Mem0 when Qdrant Cloud /health is slow.
  const response = await fetch(`${MEM0_URL}/health`, {
    signal: AbortSignal.timeout(mem0HealthTimeoutMs()),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => ({}));
  const details: string[] = [];
  const queue = body.queue as { queued?: number | null } | undefined;
  const queued = typeof queue?.queued === "number" ? queue.queued : 0;
  const vectorStore = typeof body.vector_store === "string" ? body.vector_store : "unknown";
  const runtime = body.memory_runtime as { status?: string; error?: string } | undefined;

  if (body.status === "degraded") {
    details.push("mem0 reports degraded");
  }
  if (queued > 0) {
    details.push(`${queued} queued memory saves`);
  }
  if (vectorStore !== "connected") {
    details.push(`vector store ${vectorStore}`);
  }
  if (runtime?.status && runtime.status !== "available") {
    details.push(`runtime ${runtime.status}${runtime.error ? `: ${runtime.error}` : ""}`);
  }

  return details.length > 0
    ? { status: "degraded", detail: details.join("; ") }
    : { status: "up" };
}

async function checkKnowledgeIndexing(): Promise<ServiceCheckResult> {
  // QMD-backed knowledge indexing is optional on cloud operators (oracle-1).
  // Missing qmd must not look like storage failure when mem0 + Neo4j are healthy.
  try {
    await execFileStdout("which", ["qmd"], { timeout: 2000 });
  } catch {
    return {
      status: "up",
      detail: "skipped — qmd not installed (optional local knowledge index)",
    };
  }

  const now = Date.now();
  const ttlMs = positiveNumber(process.env.KNOWLEDGE_INDEX_HEALTH_TTL_MS, 5 * 60 * 1000);
  if (knowledgeIndexCache && now - knowledgeIndexCache.checkedAt < ttlMs) {
    return knowledgeIndexCache.result;
  }

  if (!knowledgeIndexInflight) {
    knowledgeIndexInflight = runKnowledgeIndexingCheck(now).finally(() => {
      knowledgeIndexInflight = null;
    });
  }

  const requestTimeoutMs = positiveNumber(process.env.KNOWLEDGE_INDEX_HEALTH_REQUEST_TIMEOUT_MS, 2500);
  const timeoutResult = new Promise<ServiceCheckResult>((resolve) => {
    setTimeout(() => {
      if (knowledgeIndexCache) {
        resolve({
          ...knowledgeIndexCache.result,
          detail: knowledgeIndexCache.result.detail
            ? `${knowledgeIndexCache.result.detail}; refresh still running`
            : "refresh still running",
        });
        return;
      }
      resolve({ status: "degraded", detail: "knowledge indexing check still running" });
    }, requestTimeoutMs);
  });

  return Promise.race([knowledgeIndexInflight, timeoutResult]);
}

async function runKnowledgeIndexingCheck(now: number): Promise<ServiceCheckResult> {
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "scripts", "check-knowledge-indexing.mjs");
  const days = process.env.MEMORY_INDEX_DAYS ?? "2";
  const maxPending = process.env.QMD_MAX_PENDING_EMBEDDINGS ?? "10000";

  try {
    const { stdout, error } = await execFileOutput(
      process.execPath,
      [
        scriptPath,
        `--days=${days}`,
        `--max-pending-embeddings=${maxPending}`,
        "--json",
      ],
      {
        cwd: repoRoot,
        timeout: positiveNumber(process.env.KNOWLEDGE_INDEX_HEALTH_TIMEOUT_MS, 45_000),
        env: {
          ...process.env,
          QMD_FORCE_CPU: process.env.QMD_FORCE_CPU ?? "1",
        },
      }
    );
    if (!stdout.trim() && error) {
      throw error;
    }
    const report = JSON.parse(stdout) as KnowledgeIndexReport;
    const detailParts: string[] = [];
    if (typeof report.pendingEmbeddings === "number") {
      detailParts.push(`${report.pendingEmbeddings} pending embeddings`);
    }
    if (report.failures?.length) {
      detailParts.push(report.failures.slice(0, 3).join("; "));
    }
    if (report.warnings?.length) {
      detailParts.push(report.warnings.slice(0, 2).join("; "));
    }

    const result: ServiceCheckResult = report.ok
      ? { status: "up", detail: detailParts[0] }
      : { status: "degraded", detail: detailParts.join("; ") || "knowledge indexing contract failed" };
    knowledgeIndexCache = { checkedAt: now, result };
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "knowledge indexing check failed";
    const result: ServiceCheckResult = { status: "down", detail };
    knowledgeIndexCache = { checkedAt: now, result };
    return result;
  }
}

async function checkGraphMemory(): Promise<ServiceCheckResult> {
  const graph = await checkGraphHealth();
  if (graph.status === "up") {
    return { status: "up", detail: graph.backend };
  }

  // Not configured / offline must panic in the operator UI — never soft-hide as "degraded".
  if (graph.status === "not_configured") {
    return {
      status: "down",
      detail: "Neo4j is not configured; graph memory is NOT storing",
    };
  }

  return {
    status: graph.status === "degraded" ? "down" : graph.status,
    detail:
      graph.detail ??
      `${graph.backend} graph memory ${graph.status} — graph writes may be failing`,
  };
}

export async function GET() {
  const services = await Promise.all([
    checkService("RTK", async () => {
      // RTK is a local-Mac CLI compression tool, not an oracle-1 service.
      // Match QMD pattern: optional on cloud operators; never report as down here.
      try {
        await execFileStdout("rtk", ["--version"], { timeout: 2000 });
      } catch {
        return {
          status: "degraded",
          detail: "optional — rtk binary not installed (local dev tool, not an oracle-1 service)",
        };
      }
    }),
    checkService("mem0", async () => {
      return checkMem0();
    }),
    checkService("QMD", async () => {
      try {
        await execFileStdout("which", ["qmd"], { timeout: 2000 });
      } catch {
        // Optional on cloud operators (oracle-1); vector/graph/SQLite are canonical.
        return {
          status: "degraded",
          detail: "optional — qmd binary not installed (local library search only)",
        };
      }
    }),
    checkService("Knowledge Index", async () => {
      return checkKnowledgeIndexing();
    }),
    checkService("Graph Memory", async () => {
      return checkGraphMemory();
    }),
    checkService("Agents", async () => {
      await fsStat(AGENT_CONFIGS_PATH);
    }),
    checkService("APO", async () => {
      const { stat } = await import("fs/promises");
      await stat(`${process.env.HOME}/.openclaw/skills/proposals`);
    }),
    checkService("connmem", async () => {
      const base =
        process.env.CONNMEM_URL ??
        process.env.MEMROOS_DOCKER_CONNMEM_URL ??
        "http://127.0.0.1:3290";
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) {
          return {
            status: "degraded",
            detail: `connmem HTTP ${response.status} at ${base}`,
          };
        }
        const body = (await response.json().catch(() => ({}))) as { status?: string };
        if (body.status && body.status !== "ok") {
          return { status: "degraded", detail: `connmem status=${body.status}` };
        }
      } catch (error) {
        return {
          status: "degraded",
          detail: `optional when stack omits connmem — ${error instanceof Error ? error.message : "unreachable"}`,
        };
      }
    }),
  ]);

  return Response.json({ services, timestamp: new Date().toISOString() });
}
