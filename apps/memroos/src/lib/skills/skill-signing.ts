/**
 * Ed25519 content hashing + signing for the skill registry.
 *
 * SKILLTRUST-02 (Phase 148) — Skill Signing Layer.
 *
 * This module is the canonical Ed25519 signing path for MemRoOS skills.
 * It uses Node.js's built-in `crypto` (no external dependency). Key pairs
 * are generated with `crypto.generateKeyPairSync('ed25519')` and stored
 * locally in the gitignored file `data/skill-signing-key.json` so the
 * private key never reaches git, the database, or audit logs.
 *
 * Functions (per the feature spec):
 *   - generateKeyPair()                       -> { publicKey, privateKey }
 *   - hashSkillContent(body)                  -> 64-char SHA-256 hex
 *   - signSkill(privateKey, hash)             -> base64 Ed25519 signature
 *   - verifySkill(publicKey, hash, signature) -> boolean
 *
 * Supporting helpers (operator key persistence + dispatch policy hook):
 *   - publicKeyFingerprint(publicKey)               -> SHA-256 hex of DER bytes
 *   - loadOrCreateOperatorKeyPair(repoRootDir?)     -> { publicKey, privateKey, fingerprint }
 *   - signRegistryEntry(entry, privateKey, publicKey, opts?)
 *                                                    -> entry with provenance fields
 *   - signRawSkillBody(body, keyPair)               -> SkillSignatureRecord
 *   - SkillSignatureRecord                          -> { content_hash, signature, signed_by, signed_at, public_key_fingerprint }
 *
 * Security contract:
 *   - The private key is never written to the database, never serialized in
 *     audit payloads, and never appears in logs. Only public_key_fingerprint
 *     (a SHA-256 of the DER bytes) is persisted alongside the signature so
 *     the operator can identify which key signed a row without exposing it.
 *   - Signature verification is fail-closed: any error (missing key,
 *     malformed signature, wrong key, tampered hash) returns `false` rather
 *     than throwing.
 *   - The signing file `data/skill-signing-key.json` MUST be gitignored.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import path from "path";

import { resolveFromRepoRoot } from "@/lib/paths";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Operator Ed25519 keypair is stored at this path under the apps/memroos dir. */
export const OPERATOR_SIGNING_KEY_PATH = "apps/memroos/data/skill-signing-key.json";

/**
 * Default identity of the signer when none is supplied. Operator deployments
 * may override via MEMROOS_SKILL_SIGNER_ID env var (mirrors the HMAC path
 * in registry.ts for consistency in audit payloads).
 */
export const DEFAULT_SIGNER_ID = "operator";

/**
 * In-memory representation of the on-disk key file. We persist the keys as
 * PEM strings so the operator can back them up, rotate them, or inspect them
 * with `openssl`. The fingerprint is stored alongside so a single read
 * surfaces everything needed to identify the key without exposing the
 * private bytes.
 */
export interface OperatorKeyFile {
  algorithm: "ed25519";
  public_key_pem: string;
  private_key_pem: string;
  public_key_fingerprint: string;
  generated_at: string;
}

export interface GeneratedKeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export interface SkillSignatureRecord {
  content_hash: string;
  signature: string;
  signed_by: string;
  signed_at: string;
  public_key_fingerprint: string;
}

// ---------------------------------------------------------------------------
// Pure crypto primitives
// ---------------------------------------------------------------------------

/**
 * Generates a new Ed25519 keypair using Node.js's built-in crypto module.
 * Both keys are returned as KeyObject instances suitable for passing to
 * `signSkill` / `verifySkill` or for serialization via `key.exportPem()`.
 */
export function generateKeyPair(): GeneratedKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privateKey };
}

/**
 * Deterministic SHA-256 hex digest of a skill's body content. Returns a
 * 64-character lowercase hex string. Two calls with the same input always
 * produce the same output — this is the foundation of signature stability.
 */
export function hashSkillContent(body: string): string {
  return createHash("sha256").update(body ?? "", "utf8").digest("hex");
}

/**
 * Produces an Ed25519 signature over a content hash. The hash is treated as
 * a UTF-8 string (deterministic byte representation); the result is the
 * raw 64-byte Ed25519 signature encoded as base64 (compact URL-safe form).
 *
 * The privateKey must be an Ed25519 KeyObject (e.g. from `generateKeyPair`
 * or `loadOrCreateOperatorKeyPair`). The function throws if the key is
 * missing or not Ed25519.
 */
export function signSkill(privateKey: KeyObject, hash: string): string {
  if (!privateKey) {
    throw new Error("signSkill: privateKey is required");
  }
  if (typeof hash !== "string" || hash.length === 0) {
    throw new Error("signSkill: hash must be a non-empty string");
  }
  if (privateKey.type !== "private") {
    throw new Error(
      `signSkill: expected a private KeyObject, got type='${privateKey.type}'`
    );
  }
  // Ed25519 signs the raw message bytes. We sign the UTF-8 encoding of the
  // hex digest so signatures remain deterministic regardless of input shape.
  const signature = cryptoSign(null, Buffer.from(hash, "utf8"), privateKey);
  return signature.toString("base64");
}

/**
 * Verifies an Ed25519 signature against a content hash. Returns `false` on
 * any failure (wrong key, tampered hash, corrupted signature, missing
 * arguments) so callers can use the result in a boolean expression without
 * a try/catch. Never throws on input validation errors.
 */
export function verifySkill(
  publicKey: KeyObject | null | undefined,
  hash: string,
  signature: string
): boolean {
  if (!publicKey || typeof hash !== "string" || typeof signature !== "string") {
    return false;
  }
  if (hash.length === 0 || signature.length === 0) return false;
  if (publicKey.type !== "public") {
    return false;
  }
  try {
    const sigBuffer = Buffer.from(signature, "base64");
    if (sigBuffer.length === 0) return false;
    return cryptoVerify(null, Buffer.from(hash, "utf8"), publicKey, sigBuffer);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fingerprint + operator key persistence
// ---------------------------------------------------------------------------

/**
 * Derives a stable fingerprint for an Ed25519 public key. The fingerprint
 * is the lowercase hex SHA-256 of the DER-encoded public key bytes. It is
 * safe to persist alongside the signature — knowing the fingerprint does
 * not enable forgery because the private key remains undisclosed.
 */
export function publicKeyFingerprint(publicKey: KeyObject): string {
  if (!publicKey || publicKey.type !== "public") {
    throw new Error("publicKeyFingerprint: a public KeyObject is required");
  }
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

/**
 * Resolves the directory in which the operator key file lives. By default
 * the file is anchored at the repo root via `resolveFromRepoRoot`, so the
 * same key survives process restarts and is shared by all in-process
 * components that need it.
 */
export function resolveOperatorKeyPath(repoRootDir?: string): string {
  return repoRootDir
    ? path.join(repoRootDir, OPERATOR_SIGNING_KEY_PATH)
    : resolveFromRepoRoot(OPERATOR_SIGNING_KEY_PATH);
}

/**
 * Reads the operator Ed25519 keypair from disk. Returns null when the file
 * does not exist or is malformed; the caller is expected to fall back to
 * `generateOperatorKeyPair` when no key is present.
 */
export function readOperatorKeyFile(repoRootDir?: string): OperatorKeyFile | null {
  const filePath = resolveOperatorKeyPath(repoRootDir);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<OperatorKeyFile>;
    if (
      typeof parsed.public_key_pem !== "string" ||
      typeof parsed.private_key_pem !== "string" ||
      typeof parsed.public_key_fingerprint !== "string"
    ) {
      return null;
    }
    return {
      algorithm: "ed25519",
      public_key_pem: parsed.public_key_pem,
      private_key_pem: parsed.private_key_pem,
      public_key_fingerprint: parsed.public_key_fingerprint,
      generated_at: parsed.generated_at ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Writes the operator key file, creating the parent directory if needed.
 * The file is overwritten atomically (write to a temp path then rename) so
 * a crash mid-write never leaves a half-populated file behind.
 */
export function writeOperatorKeyFile(
  file: OperatorKeyFile,
  repoRootDir?: string
): string {
  const filePath = resolveOperatorKeyPath(repoRootDir);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(file, null, 2), { mode: 0o600 });
  // Rename is atomic on POSIX file systems; on Windows it's near-atomic.
  // Falls back to a regular write if rename fails (e.g. cross-device link).
  try {
    renameSync(tmpPath, filePath);
  } catch {
    writeFileSync(filePath, JSON.stringify(file, null, 2), { mode: 0o600 });
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
  // Best-effort chmod to owner-only on POSIX. Existing files keep their mode.
  try {
    chmodSync(filePath, 0o600);
  } catch {
    /* Windows: chmod is a no-op for non-POSIX semantics; ignore. */
  }
  return filePath;
}

function loadKeyPairFromFile(
  file: OperatorKeyFile
): { publicKey: KeyObject; privateKey: KeyObject; fingerprint: string } {
  const privateKey = createPrivateKey(file.private_key_pem);
  const publicKey = createPublicKey(file.public_key_pem);
  return {
    privateKey,
    publicKey,
    fingerprint: file.public_key_fingerprint,
  };
}

/**
 * Loads the operator Ed25519 keypair from disk, generating and persisting a
 * fresh one when no key file exists. The function is idempotent: repeated
 * calls with an existing key file always return the same keypair.
 *
 * The optional `repoRootDir` lets tests redirect storage to a temp dir.
 * When omitted, the operator key is anchored at the repo root.
 */
export function loadOrCreateOperatorKeyPair(
  repoRootDir?: string
): { publicKey: KeyObject; privateKey: KeyObject; fingerprint: string; created: boolean } {
  const existing = readOperatorKeyFile(repoRootDir);
  if (existing) {
    const { publicKey, privateKey, fingerprint } = loadKeyPairFromFile(existing);
    return { publicKey, privateKey, fingerprint, created: false };
  }
  const { publicKey, privateKey } = generateKeyPair();
  const fingerprint = publicKeyFingerprint(publicKey);
  writeOperatorKeyFile(
    {
      algorithm: "ed25519",
      public_key_pem: publicKey.export({ type: "spki", format: "pem" }) as string,
      private_key_pem: privateKey.export({
        type: "pkcs8",
        format: "pem",
      }) as string,
      public_key_fingerprint: fingerprint,
      generated_at: new Date().toISOString(),
    },
    repoRootDir
  );
  return { publicKey, privateKey, fingerprint, created: true };
}

// ---------------------------------------------------------------------------
// High-level helpers used by the registry / API surface
// ---------------------------------------------------------------------------

/**
 * Signs a raw skill body and returns a complete SkillSignatureRecord suitable
 * for storing in skill_registry. The content_hash is always recomputed from
 * `body` so callers cannot accidentally persist a stale hash.
 */
export function signRawSkillBody(
  body: string,
  keyPair: { privateKey: KeyObject; publicKey: KeyObject; fingerprint: string },
  signerId?: string
): SkillSignatureRecord {
  const contentHash = hashSkillContent(body);
  const signature = signSkill(keyPair.privateKey, contentHash);
  return {
    content_hash: contentHash,
    signature,
    signed_by: signerId || process.env["MEMROOS_SKILL_SIGNER_ID"] || DEFAULT_SIGNER_ID,
    signed_at: new Date().toISOString(),
    public_key_fingerprint: keyPair.fingerprint,
  };
}

/**
 * Mutates a SkillRegistryEntry-shaped object in-place by populating the
 * provenance fields (content_hash, signature, signed_by, signed_at,
 * public_key_fingerprint). Returns the same object so callers can chain
 * or use a const-style bind.
 *
 * When `keyPair` is null (e.g. the operator key file is missing or the
 * caller explicitly opts out), the entry is returned unchanged. This is
 * the "import signs when key present, skips gracefully when absent" path.
 */
export function applySignatureToRegistryEntry<
  T extends {
    content_hash?: string | null;
    signature?: string | null;
    signed_by?: string | null;
    signed_at?: string | null;
    public_key_fingerprint?: string | null;
    raw_body?: string;
  },
>(
  entry: T,
  keyPair:
    | { privateKey: KeyObject; publicKey: KeyObject; fingerprint: string }
    | null
    | undefined,
  signerId?: string
): T & Partial<SkillSignatureRecord> {
  if (!keyPair) return entry as T & Partial<SkillSignatureRecord>;
  if (!entry || typeof entry.raw_body !== "string") return entry as T & Partial<SkillSignatureRecord>;
  const record = signRawSkillBody(entry.raw_body, keyPair, signerId);
  return {
    ...entry,
    content_hash: record.content_hash,
    signature: record.signature,
    signed_by: record.signed_by,
    signed_at: record.signed_at,
    public_key_fingerprint: record.public_key_fingerprint,
  };
}

// ---------------------------------------------------------------------------
// Dispatch policy flag (VAL-SIGN-008)
// ---------------------------------------------------------------------------

/**
 * Returns true when the operator has enabled the dispatch policy flag
 * `MEMROOS_REQUIRE_SIGNED_SKILLS=true`. When enabled, the dispatch lookup
 * MUST add `AND signature IS NOT NULL` to its SQL predicate so unsigned
 * skills are denied at the SQL layer (not post-filter in JS).
 *
 * Accepted truthy values: '1', 'true', 'yes', 'on' (case-insensitive).
 */
export function isRequireSignedSkillsEnabled(): boolean {
  const raw = process.env["MEMROOS_REQUIRE_SIGNED_SKILLS"];
  if (typeof raw !== "string") return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
