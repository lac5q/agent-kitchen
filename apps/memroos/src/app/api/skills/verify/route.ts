/**
 * POST /api/skills/verify
 *
 * Verifies a skill's signature. Two modes:
 *
 *   1. Verify a stored registry row by name:
 *        { skill_name: "my-skill",
 *          source_harness?: "claude",
 *          public_key_pem?: "..." }       -- optional, defaults to local key
 *
 *   2. Verify raw content against an inline signature:
 *        { content: "---\nname: ...",
 *          content_hash: "...",
 *          signature: "...",
 *          public_key_pem: "..." }       -- public_key_pem required
 *
 * Response:
 *   { ok, verified: boolean,
 *     reason?: string,                      -- only when verified=false
 *     fingerprint?: string }                -- computed from supplied key
 *
 * Auth: operator key or loopback (same gate as the import route).
 *
 * Verification is fail-closed: any failure (missing key, malformed
 * signature, wrong key, tampered hash) returns verified=false rather than
 * throwing. The caller surfaces the reason to the operator.
 */

import { createPublicKey } from "crypto";
import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  hashSkillContent,
  publicKeyFingerprint,
  verifySkill,
} from "@/lib/skills/skill-signing";
import type Database from "better-sqlite3";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

interface RegistryRow {
  id: number;
  name: string;
  source_harness: string;
  content_hash: string | null;
  raw_body: string | null;
  signature: string | null;
  public_key_fingerprint: string | null;
}

function loadRegistryRow(
  db: Database.Database,
  skill_name: string,
  source_harness?: string
): RegistryRow | null {
  if (source_harness) {
    const row = db
      .prepare<[string, string], RegistryRow>(
        `SELECT id, name, source_harness, content_hash, raw_body,
                signature, public_key_fingerprint
           FROM skill_registry
          WHERE name = ? AND source_harness = ?
          ORDER BY imported_at DESC
          LIMIT 1`
      )
      .get(skill_name, source_harness);
    return row ?? null;
  }
  const row = db
    .prepare<[string], RegistryRow>(
      `SELECT id, name, source_harness, content_hash, raw_body,
              signature, public_key_fingerprint
         FROM skill_registry
        WHERE name = ?
        ORDER BY imported_at DESC
        LIMIT 1`
    )
    .get(skill_name);
  return row ?? null;
}

function tryParsePublicKey(publicKeyPem: string) {
  try {
    const key = createPublicKey(publicKeyPem);
    return key;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
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

  const skillName = typeof body["skill_name"] === "string" ? body["skill_name"].trim() : "";
  const sourceHarness =
    typeof body["source_harness"] === "string" ? body["source_harness"].trim() : "";
  const inlineContent = typeof body["content"] === "string" ? body["content"] : null;
  const inlineHash = typeof body["content_hash"] === "string" ? body["content_hash"] : null;
  const inlineSignature =
    typeof body["signature"] === "string" ? body["signature"] : null;
  const publicKeyPem =
    typeof body["public_key_pem"] === "string" ? body["public_key_pem"] : null;

  // Resolve the public key. Inline mode requires an explicit PEM. Stored
  // mode uses the operator's local key (loaded from data/skill-signing-key.json)
  // so the operator can verify their own signatures without copying PEMs around.
  let publicKey;
  if (publicKeyPem) {
    publicKey = tryParsePublicKey(publicKeyPem);
    if (!publicKey) {
      return Response.json(
        { ok: false, verified: false, reason: "public_key_pem is not a valid PEM-encoded key" },
        { status: 400 }
      );
    }
  } else {
    try {
      const { readOperatorKeyFile } = await import("@/lib/skills/skill-signing");
      const file = readOperatorKeyFile();
      if (!file) {
        return Response.json(
          {
            ok: false,
            verified: false,
            reason:
              "No operator key file present and no public_key_pem supplied; cannot verify",
          },
          { status: 400 }
        );
      }
      publicKey = tryParsePublicKey(file.public_key_pem);
      if (!publicKey) {
        return Response.json(
          { ok: false, verified: false, reason: "Stored operator key is malformed" },
          { status: 500 }
        );
      }
    } catch (err) {
      return Response.json(
        {
          ok: false,
          verified: false,
          reason: `Failed to load operator key: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 }
      );
    }
  }

  const fingerprint = publicKeyFingerprint(publicKey);

  // Mode 2: inline verification.
  if (inlineContent !== null || inlineHash || inlineSignature) {
    if (!inlineHash || !inlineSignature) {
      return Response.json(
        {
          ok: false,
          verified: false,
          reason:
            "Inline mode requires both content_hash and signature (and optionally content to recompute the hash)",
        },
        { status: 400 }
      );
    }
    const computedHash = inlineContent !== null ? hashSkillContent(inlineContent) : inlineHash;
    if (inlineContent !== null && computedHash !== inlineHash) {
      return Response.json({
        ok: true,
        verified: false,
        reason: "content_hash does not match content (tampering detected)",
        fingerprint,
        recomputed_hash: computedHash,
      });
    }
    const verified = verifySkill(publicKey, inlineHash, inlineSignature);
    return Response.json({
      ok: true,
      verified,
      ...(verified ? {} : { reason: "Signature did not verify against the supplied key" }),
      fingerprint,
    });
  }

  // Mode 1: stored-row verification.
  if (!skillName) {
    return Response.json(
      {
        ok: false,
        error:
          "Provide either 'skill_name' or all of (content_hash, signature, optional content, optional public_key_pem)",
      },
      { status: 400 }
    );
  }
  const db = getDb();
  const row = loadRegistryRow(db, skillName, sourceHarness || undefined);
  if (!row) {
    return Response.json(
      {
        ok: false,
        verified: false,
        reason: `Skill '${skillName}' not found in registry${sourceHarness ? ` for harness '${sourceHarness}'` : ""}`,
      },
      { status: 404 }
    );
  }
  if (!row.signature || !row.content_hash) {
    return Response.json({
      ok: true,
      verified: false,
      reason: "Skill row has no signature or no content_hash on record",
      fingerprint,
    });
  }

  // Recompute the hash from raw_body to detect tampering (VAL-SIGN-010).
  if (row.raw_body) {
    const recomputed = hashSkillContent(row.raw_body);
    if (recomputed !== row.content_hash) {
      return Response.json({
        ok: true,
        verified: false,
        reason: "Stored content_hash does not match raw_body (tampering detected)",
        fingerprint,
      });
    }
  }

  const verified = verifySkill(publicKey, row.content_hash, row.signature);
  return Response.json({
    ok: true,
    verified,
    skill: {
      id: row.id,
      name: row.name,
      source_harness: row.source_harness,
      content_hash: row.content_hash,
      public_key_fingerprint: row.public_key_fingerprint,
    },
    ...(verified ? {} : { reason: "Signature did not verify against the supplied key" }),
    fingerprint,
  });
}
