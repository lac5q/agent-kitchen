/**
 * POST /api/skills/sync/check
 *
 * Triggers a harness scan: detect SKILL.md files across the four
 * harness roots (Claude Code, Codex, Hermes, OpenCode), diff each
 * detected entry against skill_registry, and record drift as a pending
 * proposal in `skill_sync_state`. The registry is NEVER mutated by this
 * route — approvals are a separate route.
 *
 * Body:
 *   {
 *     roots: {
 *       claude: string,    // path to .claude/skills dir
 *       codex: string,     // path to codex skills dir
 *       hermes: string,    // path to hermes skills dir
 *       opencode: string   // path to opencode skills dir
 *     },
 *     proposed_by?: string  // defaults to "sync-scanner"
 *   }
 *
 * Auth: operator-only (mirrors /api/skills/proposals). Loopback is
 * always authorized.
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import { authorizeSyncWrite } from "@/app/api/skills/_sync-auth";
import {
  checkSync,
  SUPPORTED_HARNESSES,
  SkillSyncError,
  type HarnessRoots,
} from "@/lib/skills/skill-sync";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isStringOrUndefined(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

export async function POST(request: Request) {
  const auth = authorizeSyncWrite(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Body must be an object" }, { status: 400 });
  }

  const rootsRaw = body["roots"];
  if (!isRecord(rootsRaw)) {
    return Response.json(
      { ok: false, error: "roots is required (object)" },
      { status: 400 }
    );
  }
  const roots: HarnessRoots = {
    claude: typeof rootsRaw["claude"] === "string" ? (rootsRaw["claude"] as string) : "",
    codex: typeof rootsRaw["codex"] === "string" ? (rootsRaw["codex"] as string) : "",
    hermes: typeof rootsRaw["hermes"] === "string" ? (rootsRaw["hermes"] as string) : "",
    opencode: typeof rootsRaw["opencode"] === "string" ? (rootsRaw["opencode"] as string) : "",
  };
  for (const harness of SUPPORTED_HARNESSES) {
    if (!roots[harness]) {
      return Response.json(
        {
          ok: false,
          error: `roots.${harness} is required (string path)`,
        },
        { status: 400 }
      );
    }
  }

  const proposedByRaw = body["proposed_by"];
  if (!isStringOrUndefined(proposedByRaw)) {
    return Response.json(
      { ok: false, error: "proposed_by must be a string when present" },
      { status: 400 }
    );
  }

  const db = getDb();
  try {
    const result = checkSync(db, {
      roots,
      ...(proposedByRaw ? { proposed_by: proposedByRaw } : {}),
    });
    return Response.json({
      ok: true,
      detected: result.detected,
      created: result.created,
      unchanged: result.unchanged,
      errors: result.errors,
    });
  } catch (err) {
    if (err instanceof SkillSyncError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    return Response.json(
      {
        ok: false,
        error: `Sync check failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
