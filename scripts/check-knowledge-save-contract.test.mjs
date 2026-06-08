import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateKnowledgeSaveContract,
  parseFrontmatter,
  validateDriveEvidence,
  validateKnowledgeDocument,
} from "./check-knowledge-save-contract.mjs";

const GOOD_MARKDOWN = `---
title: Cordant Account Rules
summary: Canonical operating rules for Cordant account identity, sharing, and outbound signatures.
project: cordant
owner: luis@cordant.ai
source_type: google_drive
sensitivity: internal
canonical_status: canonical
last_verified_at: 2026-06-08T12:00:00Z
---

# Cordant Account Rules

Cordant workspace artifacts should be owned and verified from luis@cordant.ai.
Outbound drafts keep the co-generated AI disclosure unless Luis explicitly opts
out. The Drive source is retained as evidence, but this Markdown file is the
canonical operating copy for agent retrieval.
`;

const GOOD_DRIVE = {
  fileId: "1abcDEF",
  url: "https://docs.google.com/document/d/1abcDEF/edit",
  accountEmail: "luis@cordant.ai",
  ownerEmail: "luis@cordant.ai",
  modifiedTime: "2026-06-08T11:55:00Z",
  version: "42",
  lastVerifiedAt: "2026-06-08T12:00:00Z",
  capabilities: { canDownload: true },
  permissions: [
    { type: "user", role: "owner", emailAddress: "luis@cordant.ai" },
    { type: "anyone", role: "reader", allowFileDiscovery: false },
  ],
};

describe("knowledge save contract eval helpers", () => {
  it("parses required frontmatter from a canonical knowledge file", () => {
    const parsed = parseFrontmatter(GOOD_MARKDOWN);

    assert.equal(parsed.title, "Cordant Account Rules");
    assert.equal(parsed.project, "cordant");
    assert.equal(parsed.canonical_status, "canonical");
  });

  it("accepts a complete saved, committed, indexed, source-fresh knowledge artifact", () => {
    const result = evaluateKnowledgeSaveContract({
      path: "content/cordant/account-rules.md",
      content: GOOD_MARKDOWN,
      sourceKind: "google_drive",
      drive: GOOD_DRIVE,
      git: { committed: true, pushed: true, porcelain: "" },
      qmd: {
        collection: "knowledge",
        listed: true,
        getOk: true,
        pendingEmbeddings: 0,
        retrievalProbes: [{ query: "Cordant account identity", hit: true }],
      },
      contextSources: [{ id: "qmd", status: "ok" }],
      memoryConflicts: [
        {
          memoryValue: "use default personal account",
          knowledgeValue: "use luis@cordant.ai",
          knowledgeFresh: true,
          resolvedSource: "knowledge",
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });

  it("fails link-only knowledge because the canonical body is not portable", () => {
    const result = validateKnowledgeDocument({
      path: "content/cordant/account-rules.md",
      content: `---
title: Cordant Account Rules
summary: Link only.
project: cordant
owner: luis@cordant.ai
source_type: google_drive
sensitivity: internal
canonical_status: canonical
last_verified_at: 2026-06-08T12:00:00Z
---

See https://docs.google.com/document/d/1abcDEF/edit
`,
    });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === "KNOWLEDGE_BODY_TOO_THIN"));
  });

  it("fails Drive evidence when account, download capability, or sharing proof is missing", () => {
    const result = validateDriveEvidence(
      {
        ...GOOD_DRIVE,
        accountEmail: "luis.calderon@gmail.com",
        capabilities: { canDownload: false },
        permissions: [{ type: "user", role: "reader", emailAddress: "luis@cordant.ai" }],
      },
      {
        intendedAccountEmail: "luis@cordant.ai",
        requiredPermission: { type: "anyone", role: "reader", allowFileDiscovery: false },
      }
    );

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === "DRIVE_ACCOUNT_MISMATCH"));
    assert.ok(result.failures.some((failure) => failure.code === "DRIVE_CANNOT_DOWNLOAD"));
    assert.ok(result.failures.some((failure) => failure.code === "DRIVE_REQUIRED_PERMISSION_MISSING"));
  });

  it("fails when QMD cannot list and retrieve the saved file", () => {
    const result = evaluateKnowledgeSaveContract({
      path: "content/cordant/account-rules.md",
      content: GOOD_MARKDOWN,
      sourceKind: "local",
      git: { committed: true, pushed: true, porcelain: "" },
      qmd: {
        collection: "knowledge",
        listed: true,
        getOk: false,
        pendingEmbeddings: 50,
        retrievalProbes: [{ query: "Cordant account identity", hit: false }],
      },
      contextSources: [{ id: "qmd", status: "ok" }],
    });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === "QMD_GET_FAILED"));
    assert.ok(result.failures.some((failure) => failure.code === "QMD_RETRIEVAL_PROBE_FAILED"));
  });

  it("fails stale source lanes instead of allowing adjacent-summary reconstruction", () => {
    const result = evaluateKnowledgeSaveContract({
      path: "content/cordant/account-rules.md",
      content: GOOD_MARKDOWN,
      sourceKind: "local",
      git: { committed: true, pushed: true, porcelain: "" },
      qmd: { collection: "knowledge", listed: true, getOk: true, pendingEmbeddings: 0 },
      contextSources: [{ id: "spark", status: "stale" }],
    });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === "SOURCE_STALE"));
  });

  it("fails when fresh canonical knowledge loses to compact memory", () => {
    const result = evaluateKnowledgeSaveContract({
      path: "content/cordant/account-rules.md",
      content: GOOD_MARKDOWN,
      sourceKind: "local",
      git: { committed: true, pushed: true, porcelain: "" },
      qmd: { collection: "knowledge", listed: true, getOk: true, pendingEmbeddings: 0 },
      contextSources: [{ id: "qmd", status: "ok" }],
      memoryConflicts: [
        {
          memoryValue: "use personal Gmail",
          knowledgeValue: "use luis@cordant.ai",
          knowledgeFresh: true,
          resolvedSource: "memory",
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === "MEMORY_OVERRIDES_FRESH_KNOWLEDGE"));
  });
});
