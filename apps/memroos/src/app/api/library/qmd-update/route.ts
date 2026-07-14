/**
 * POST /api/library/qmd-update
 *
 * Authenticated operator route that spawns `qmd update` and streams structured
 * SSE events to the caller while the process runs.
 *
 * Auth: requires valid session (authenticateUser) with operator or admin role.
 * Process safety: uses spawn(), never exec/execSync. Cleans up on disconnect.
 *
 * The lifecycle of a qmd update is recorded through the bounded freshness
 * state machine in `@/lib/memory/qmd` (serializeQmdUpdate / finalizeQmdUpdate).
 * That state machine is the authoritative receipt surface for VAL-MEM-012:
 * concurrent, cancelled, timed-out, failed, and successful updates all produce
 * one bounded freshness state, failure never advances lastSuccessTimestamp, and
 * the entries link the qmd source hash so erasure can follow them.
 *
 * SSE event types (JSON payload in data field):
 *   { type: "started", pid: number }
 *   { type: "stdout", line: string }
 *   { type: "stderr", line: string }
 *   { type: "completed", exitCode: number, updateId, sourceHash, lastSuccessTimestamp }
 *   { type: "failed", error, updateId?, sourceHash? }
 */

import { spawn } from "child_process";
import path from "path";
import type { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { serializeQmdUpdate, finalizeQmdUpdate } from "@/lib/memory/qmd";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Maximum runtime for qmd update before we kill it (30 minutes). */
const MAX_RUNTIME_MS = 30 * 60 * 1_000;

function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  // Auth gate -- operator or admin only
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  // Resolve qmd binary from env or fall back to PATH
  const qmdBin = process.env.QMD_BIN ?? "qmd";
  const targetPath = process.env.QMD_INDEX_PATH
    ?? (process.env.HOME ? path.join(process.env.HOME, ".cache/qmd/index.sqlite") : null)
    ?? "qmd_index";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let finished = false;

      function enqueue(payload: Record<string, unknown>) {
        if (finished) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(payload)));
        } catch {
          // client disconnected -- ignore write errors
        }
      }

      function close() {
        if (finished) return;
        finished = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      let child: ReturnType<typeof spawn> | null = null;

      // Persist the update as a bounded freshness state BEFORE we spawn the
      // process so a crash between serialize and finalize still produces a
      // `pending` row that downstream readers can resolve.
      let updateId: string | null = null;
      let sourceHash: string | null = null;
      try {
        const db = getDb();
        const state = serializeQmdUpdate(db, targetPath, "");
        updateId = state.id;
        sourceHash = state.sourceHash;
        enqueue({ type: "queued", updateId, sourceHash });
      } catch (err) {
        enqueue({
          type: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        close();
        return;
      }

      // Enforce maximum runtime
      const killTimer = setTimeout(() => {
        if (child && !child.killed) {
          child.kill("SIGTERM");
          if (updateId) {
            try {
              finalizeQmdUpdate(getDb(), updateId, "timeout");
            } catch {
              // best-effort
            }
          }
          enqueue({ type: "failed", error: "qmd update exceeded maximum runtime; killed.", updateId });
        }
        close();
      }, MAX_RUNTIME_MS);

      // Clean up on client disconnect
      req.signal.addEventListener("abort", () => {
        clearTimeout(killTimer);
        if (child && !child.killed) {
          child.kill("SIGTERM");
          if (updateId) {
            try {
              finalizeQmdUpdate(getDb(), updateId, "cancelled");
            } catch {
              // best-effort
            }
          }
        }
        close();
      });

      try {
        child = spawn(qmdBin, ["update"], {
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
            ...process.env,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (spawnErr) {
        clearTimeout(killTimer);
        if (updateId) {
          try {
            finalizeQmdUpdate(getDb(), updateId, "failed");
          } catch {
            // best-effort
          }
        }
        enqueue({
          type: "failed",
          error: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
          updateId,
        });
        close();
        return;
      }

      enqueue({ type: "started", pid: child.pid ?? null, updateId });

      child.stdout?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.trim()) enqueue({ type: "stdout", line: line.trim() });
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.trim()) enqueue({ type: "stderr", line: line.trim() });
        }
      });

      child.on("error", (err) => {
        clearTimeout(killTimer);
        if (updateId) {
          try {
            finalizeQmdUpdate(getDb(), updateId, "failed");
          } catch {
            // best-effort
          }
        }
        enqueue({ type: "failed", error: err.message, updateId });
        close();
      });

      child.on("close", (exitCode) => {
        clearTimeout(killTimer);
        if (exitCode === 0) {
          const finalState = updateId
            ? finalizeQmdUpdate(getDb(), updateId, "success")
            : null;
          enqueue({
            type: "completed",
            exitCode: 0,
            updateId,
            sourceHash,
            lastSuccessTimestamp: finalState?.lastSuccessTimestamp ?? null,
          });
        } else {
          if (updateId) {
            try {
              finalizeQmdUpdate(getDb(), updateId, "failed");
            } catch {
              // best-effort
            }
          }
          enqueue({
            type: "failed",
            error: `qmd update exited with code ${exitCode ?? "null"}`,
            updateId,
          });
        }
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
