// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LocalFileKeyProvider,
  decryptVaultBody,
  encryptVaultBody,
  rewrapVaultEnvelope,
  shouldEncryptVaultLabel,
} from "../envelope";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-vault-envelope-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("vault envelope encryption", () => {
  it("encrypts and decrypts with a local file-backed key", () => {
    const provider = new LocalFileKeyProvider(path.join(tmpDir, "vault.key"));
    const plaintext = Buffer.from("sensitive artifact body", "utf8");

    const envelope = encryptVaultBody(plaintext, provider);
    const decrypted = decryptVaultBody(envelope, provider);

    expect(envelope.keyId).toBe("local-v1");
    expect(envelope.ciphertext).not.toContain("sensitive artifact body");
    expect(decrypted.toString("utf8")).toBe("sensitive artifact body");
  });

  it("rewraps a data key after rotating the key-encryption key", () => {
    const provider = new LocalFileKeyProvider(path.join(tmpDir, "vault.key"));
    const plaintext = Buffer.from("rotation survives replay", "utf8");
    const envelope = encryptVaultBody(plaintext, provider);

    provider.rotate("local-v2");
    const rewrapped = rewrapVaultEnvelope(envelope, provider, provider);

    expect(rewrapped.keyId).toBe("local-v2");
    expect(decryptVaultBody(rewrapped, provider).toString("utf8")).toBe("rotation survives replay");
  });

  it("classifies which vault labels require encryption", () => {
    expect(
      shouldEncryptVaultLabel({
        visibility: "public_safe",
        policy: "indexable",
        domain: "engineering",
        sensitivity: null,
      })
    ).toBe(false);
    expect(
      shouldEncryptVaultLabel({
        visibility: "internal",
        policy: "requires_redaction",
        domain: "client",
        sensitivity: null,
      })
    ).toBe(true);
    expect(
      shouldEncryptVaultLabel({
        visibility: "internal",
        policy: "indexable",
        domain: "finance",
        sensitivity: "payment",
      })
    ).toBe(true);
  });
});
