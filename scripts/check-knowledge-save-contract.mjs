#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FRONTMATTER = [
  "title",
  "summary",
  "project",
  "owner",
  "source_type",
  "sensitivity",
  "canonical_status",
  "last_verified_at",
];

const REQUIRED_DRIVE_FIELDS = [
  "fileId",
  "url",
  "accountEmail",
  "ownerEmail",
  "modifiedTime",
  "version",
  "lastVerifiedAt",
];

const ROLE_STRENGTH = {
  reader: 1,
  commenter: 2,
  writer: 3,
  fileOrganizer: 4,
  organizer: 5,
  owner: 6,
};

function failure(code, message, detail = {}) {
  return { code, message, ...detail };
}

function resultFrom(failures, warnings = []) {
  return { ok: failures.length === 0, failures, warnings };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}

export function parseFrontmatter(markdown) {
  if (!nonEmptyString(markdown) || !markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return {};

  const frontmatter = {};
  for (const rawLine of markdown.slice(4, end).split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) frontmatter[key] = parseScalar(value);
  }
  return frontmatter;
}

function markdownBody(markdown) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  return end === -1 ? markdown : markdown.slice(end + 4);
}

function bodyIsPortable(body) {
  const normalized = body
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#>*_`[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 120;
}

export function validateKnowledgeDocument({ path: relativePath, content }) {
  const failures = [];
  if (!nonEmptyString(relativePath) || path.isAbsolute(relativePath) || relativePath.includes("..")) {
    failures.push(failure("KNOWLEDGE_PATH_INVALID", "Knowledge path must be repo-relative and stay inside the knowledge root."));
  }
  if (!String(relativePath ?? "").endsWith(".md")) {
    failures.push(failure("KNOWLEDGE_PATH_NOT_MARKDOWN", "Canonical knowledge artifacts must be Markdown files."));
  }

  if (!nonEmptyString(content)) {
    failures.push(failure("KNOWLEDGE_CONTENT_EMPTY", "Knowledge content is empty."));
    return resultFrom(failures);
  }

  const frontmatter = parseFrontmatter(content);
  for (const field of REQUIRED_FRONTMATTER) {
    if (!nonEmptyString(frontmatter[field])) {
      failures.push(failure("KNOWLEDGE_FRONTMATTER_MISSING", `Missing required frontmatter field: ${field}`, { field }));
    }
  }

  if (!["canonical", "staging", "archived"].includes(String(frontmatter.canonical_status ?? ""))) {
    failures.push(
      failure("KNOWLEDGE_CANONICAL_STATUS_INVALID", "canonical_status must be one of canonical, staging, or archived.")
    );
  }

  if (!bodyIsPortable(markdownBody(content))) {
    failures.push(
      failure(
        "KNOWLEDGE_BODY_TOO_THIN",
        "Knowledge body is too thin or link-only; canonical knowledge must include a portable summary/body."
      )
    );
  }

  return resultFrom(failures);
}

function permissionMeetsRequirement(permission, requirement) {
  if (!isRecord(permission)) return false;
  if (requirement.type && permission.type !== requirement.type) return false;
  if (requirement.emailAddress && permission.emailAddress !== requirement.emailAddress) return false;
  if (requirement.domain && permission.domain !== requirement.domain) return false;

  const actualStrength = ROLE_STRENGTH[permission.role] ?? 0;
  const requiredStrength = ROLE_STRENGTH[requirement.role] ?? 0;
  if (actualStrength < requiredStrength) return false;

  if (
    Object.hasOwn(requirement, "allowFileDiscovery") &&
    permission.allowFileDiscovery !== requirement.allowFileDiscovery
  ) {
    return false;
  }

  return true;
}

export function validateDriveEvidence(evidence, policy = {}) {
  const failures = [];
  if (!isRecord(evidence)) {
    return resultFrom([failure("DRIVE_EVIDENCE_MISSING", "Drive-backed knowledge requires Drive metadata evidence.")]);
  }

  for (const field of REQUIRED_DRIVE_FIELDS) {
    if (!nonEmptyString(evidence[field])) {
      failures.push(failure("DRIVE_FIELD_MISSING", `Missing Drive evidence field: ${field}`, { field }));
    }
  }

  if (policy.intendedAccountEmail && evidence.accountEmail !== policy.intendedAccountEmail) {
    failures.push(
      failure("DRIVE_ACCOUNT_MISMATCH", "Drive source was verified with the wrong Google account.", {
        expected: policy.intendedAccountEmail,
        actual: evidence.accountEmail,
      })
    );
  }

  if (!evidence.capabilities?.canDownload) {
    failures.push(failure("DRIVE_CANNOT_DOWNLOAD", "Drive file cannot be downloaded/exported by the verified account."));
  }

  if (!Array.isArray(evidence.permissions) || evidence.permissions.length === 0) {
    failures.push(failure("DRIVE_PERMISSIONS_MISSING", "Drive permission list is missing."));
  }

  if (policy.requiredPermission) {
    const hasRequiredPermission = (evidence.permissions ?? []).some((permission) =>
      permissionMeetsRequirement(permission, policy.requiredPermission)
    );
    if (!hasRequiredPermission) {
      failures.push(
        failure("DRIVE_REQUIRED_PERMISSION_MISSING", "Drive file does not expose the required sharing permission.", {
          requiredPermission: policy.requiredPermission,
        })
      );
    }
  }

  return resultFrom(failures);
}

function validateGitEvidence(git = {}) {
  const failures = [];
  if (!git.committed) {
    failures.push(failure("GIT_NOT_COMMITTED", "Knowledge file was not committed."));
  }
  if (!git.pushed) {
    failures.push(failure("GIT_NOT_PUSHED", "Knowledge commit was not pushed or push status was not verified."));
  }
  if (nonEmptyString(git.porcelain)) {
    failures.push(failure("GIT_DIRTY", "Knowledge repo has uncommitted changes.", { porcelain: git.porcelain }));
  }
  return resultFrom(failures);
}

function validateQmdEvidence(qmd = {}, policy = {}) {
  const failures = [];
  const maxPendingEmbeddings = Number(policy.maxPendingEmbeddings ?? 10_000);
  if (!nonEmptyString(qmd.collection)) {
    failures.push(failure("QMD_COLLECTION_MISSING", "QMD collection was not recorded."));
  }
  if (!qmd.listed) {
    failures.push(failure("QMD_LIST_MISSING", "Saved file is not listed in QMD."));
  }
  if (!qmd.getOk) {
    failures.push(failure("QMD_GET_FAILED", "Saved file cannot be retrieved with qmd get."));
  }
  if (Number(qmd.pendingEmbeddings ?? 0) > maxPendingEmbeddings) {
    failures.push(
      failure("QMD_PENDING_EMBEDDINGS_HIGH", "QMD pending embeddings exceeds the allowed threshold.", {
        pendingEmbeddings: qmd.pendingEmbeddings,
        maxPendingEmbeddings,
      })
    );
  }
  for (const probe of qmd.retrievalProbes ?? []) {
    if (!probe.hit) {
      failures.push(
        failure("QMD_RETRIEVAL_PROBE_FAILED", "QMD retrieval probe did not find the saved artifact.", {
          query: probe.query,
        })
      );
    }
  }
  return resultFrom(failures);
}

function validateContextSources(contextSources = []) {
  const failures = [];
  for (const source of contextSources) {
    if (source.status === "ok" || source.status === "disabled") continue;
    if (source.status === "missing") {
      failures.push(failure("SOURCE_MISSING", `Required source ${source.id} is missing.`, { sourceId: source.id }));
    } else {
      failures.push(
        failure("SOURCE_STALE", `Required source ${source.id} is ${source.status}.`, {
          sourceId: source.id,
          status: source.status,
        })
      );
    }
  }
  return resultFrom(failures);
}

function validateMemoryConflicts(memoryConflicts = []) {
  const failures = [];
  for (const conflict of memoryConflicts) {
    if (conflict.knowledgeFresh && conflict.resolvedSource !== "knowledge") {
      failures.push(
        failure("MEMORY_OVERRIDES_FRESH_KNOWLEDGE", "Fresh canonical knowledge must win over compact memory.", {
          memoryValue: conflict.memoryValue,
          knowledgeValue: conflict.knowledgeValue,
        })
      );
    }
  }
  return resultFrom(failures);
}

export function evaluateKnowledgeSaveContract(caseData, policy = {}) {
  const checks = [
    validateKnowledgeDocument(caseData),
    validateGitEvidence(caseData.git),
    validateQmdEvidence(caseData.qmd, policy.qmd),
    validateContextSources(caseData.contextSources),
    validateMemoryConflicts(caseData.memoryConflicts),
  ];

  if (caseData.sourceKind === "google_drive" || parseFrontmatter(caseData.content ?? {}).source_type === "google_drive") {
    checks.push(validateDriveEvidence(caseData.drive, policy.drive));
  }

  const failures = checks.flatMap((check) => check.failures);
  const warnings = checks.flatMap((check) => check.warnings ?? []);
  return { ok: failures.length === 0, failures, warnings };
}

function parseArgs(argv) {
  const args = { fixture: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--fixture") args.fixture = argv[++i] ?? "";
    else if (arg.startsWith("--fixture=")) args.fixture = arg.slice("--fixture=".length);
  }
  return args;
}

function runFixture(fixturePath) {
  const raw = fs.readFileSync(fixturePath, "utf8");
  const fixture = JSON.parse(raw);
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  const results = cases.map((item) => ({
    id: item.id,
    ...evaluateKnowledgeSaveContract(item.input, item.policy ?? fixture.policy ?? {}),
  }));
  return {
    ok: results.every((item) => item.ok),
    fixture: fixturePath,
    results,
  };
}

function printReport(report, json = false) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Knowledge save contract: ${report.ok ? "OK" : "FAILED"}`);
  for (const result of report.results) {
    console.log(`- ${result.id}: ${result.ok ? "ok" : "failed"}`);
    for (const item of result.failures) {
      console.log(`  ${item.code}: ${item.message}`);
    }
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.fixture) {
    console.error("Usage: node scripts/check-knowledge-save-contract.mjs --fixture evals/knowledge-save-contract/cases.json [--json]");
    process.exit(2);
  }
  const report = runFixture(args.fixture);
  printReport(report, args.json);
  process.exit(report.ok ? 0 : 1);
}
