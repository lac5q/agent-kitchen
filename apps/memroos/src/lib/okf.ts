import matter from "gray-matter";

import type { MemoryEntry } from "@/types";

export const OKF_VERSION = "0.1";

export type OkfFrontmatter = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

export interface OkfConcept {
  path: string;
  frontmatter: OkfFrontmatter;
  body: string;
  content: string;
}

export interface BuildOkfConceptOptions {
  title?: string;
  description?: string;
  tags?: string[];
  securityLabel?: string;
  classification?: string;
  authorizationPolicy?: string;
  provenanceHash?: string;
  receiptId?: string;
  rawArtifactId?: string;
}

export interface BuildOkfBundleInput {
  name: string;
  concepts: OkfConcept[];
  timestamp?: string;
}

export interface OkfValidationIssue {
  path: string;
  code:
    | "invalid_path"
    | "invalid_frontmatter"
    | "missing_type"
    | "reserved_frontmatter"
    | "broken_link";
  message: string;
  target?: string;
}

export interface OkfValidationResult {
  conformant: boolean;
  errors: OkfValidationIssue[];
  warnings: OkfValidationIssue[];
}

const RESERVED_FILES = new Set(["index.md", "log.md"]);
const BUNDLE_LINK_PATTERN = /\[[^\]]+\]\(([^)#][^)]*\.md(?:#[^)]*)?)\)/g;

export function buildOkfConceptFromMemory(
  memory: MemoryEntry,
  options: BuildOkfConceptOptions = {}
): OkfConcept {
  const conceptPath = normalizeConceptPath(`memory/${memory.id}`);
  const frontmatter: OkfFrontmatter = {
    type: "Memory Entry",
    title: options.title ?? memory.id,
    description: options.description ?? firstSentence(memory.content),
    resource: memory.source,
    tags: options.tags ?? ["memory", memory.type],
    timestamp: memory.date,
    okf_version: OKF_VERSION,
    memroos_id: memory.id,
    agent_id: memory.agent,
    source_type: memory.agent,
    memory_type: memory.type,
    security_label: options.securityLabel,
    classification: options.classification,
    authorization_policy: options.authorizationPolicy,
    provenance_hash: options.provenanceHash,
    receipt_id: options.receiptId,
    raw_artifact_id: options.rawArtifactId,
  };
  const body = memory.content.trim();
  const content = serializeOkfDocument(frontmatter, body);

  return { path: conceptPath, frontmatter, body, content };
}

export function buildOkfBundle(input: BuildOkfBundleInput): Record<string, string> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const bundle: Record<string, string> = {};
  const concepts = [...input.concepts].sort((a, b) => a.path.localeCompare(b.path));

  bundle["index.md"] = serializeOkfDocument(
    { okf_version: OKF_VERSION, type: "Bundle Index", title: input.name, timestamp },
    [
      `# ${input.name}`,
      "",
      ...concepts.map((concept) => {
        const title = String(concept.frontmatter.title ?? concept.path.replace(/\.md$/, ""));
        const description = concept.frontmatter.description
          ? ` - ${String(concept.frontmatter.description)}`
          : "";
        return `* [${title}](${concept.path})${description}`;
      }),
    ].join("\n")
  );

  bundle["log.md"] = [
    "# Directory Update Log",
    "",
    `## ${timestamp.slice(0, 10)}`,
    `* **Export**: Generated OKF v${OKF_VERSION} bundle with ${concepts.length} concept document${concepts.length === 1 ? "" : "s"}.`,
    "",
  ].join("\n");

  for (const concept of concepts) {
    bundle[concept.path] = concept.content;
  }

  return bundle;
}

export function parseOkfDocument(content: string): { frontmatter: OkfFrontmatter; body: string } {
  const parsed = matter(content);
  return {
    frontmatter: parsed.data as OkfFrontmatter,
    body: parsed.content.trim(),
  };
}

export function validateOkfBundle(bundle: Record<string, string>): OkfValidationResult {
  const errors: OkfValidationIssue[] = [];
  const warnings: OkfValidationIssue[] = [];
  const conceptPaths = new Set(
    Object.keys(bundle).filter((filePath) => filePath.endsWith(".md") && !isReservedFile(filePath))
  );

  for (const [filePath, content] of Object.entries(bundle)) {
    if (!filePath.endsWith(".md")) continue;
    if (filePath.startsWith("/") || filePath.includes("..")) {
      errors.push({
        path: filePath,
        code: "invalid_path",
        message: "OKF bundle paths must be relative and must not contain traversal segments.",
      });
      continue;
    }

    if (isReservedFile(filePath)) {
      const parsed = matter(content);
      if (filePath !== "index.md" && Object.keys(parsed.data).length > 0) {
        errors.push({
          path: filePath,
          code: "reserved_frontmatter",
          message: "Only the root index.md may include OKF version frontmatter.",
        });
      }
      continue;
    }

    let parsed: { frontmatter: OkfFrontmatter; body: string };
    try {
      parsed = parseOkfDocument(content);
    } catch {
      errors.push({
        path: filePath,
        code: "invalid_frontmatter",
        message: "Concept document frontmatter must be parseable YAML.",
      });
      continue;
    }

    if (!parsed.frontmatter.type || String(parsed.frontmatter.type).trim() === "") {
      errors.push({
        path: filePath,
        code: "missing_type",
        message: "Concept documents must include non-empty type frontmatter.",
      });
    }

    for (const target of extractBundleLinks(parsed.body)) {
      const resolvedTarget = resolveBundleLink(filePath, target);
      if (!conceptPaths.has(resolvedTarget) && !RESERVED_FILES.has(resolvedTarget)) {
        warnings.push({
          path: filePath,
          code: "broken_link",
          target: resolvedTarget,
          message: "Markdown link target is not present in the OKF bundle.",
        });
      }
    }
  }

  return { conformant: errors.length === 0, errors, warnings };
}

function serializeOkfDocument(frontmatter: OkfFrontmatter, body: string): string {
  const yaml = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${serializeYamlValue(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n${body.trim()}\n`;
}

function serializeYamlValue(value: OkfFrontmatter[string]): string {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function normalizeConceptPath(value: string): string {
  return value
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function firstSentence(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "MemRoOS memory entry.";
  const match = compact.match(/^(.{1,180}?)([.!?](?:\s|$)|$)/);
  return (match?.[1] ?? compact.slice(0, 180)).trim();
}

function isReservedFile(filePath: string): boolean {
  return RESERVED_FILES.has(filePath.split("/").at(-1) ?? "");
}

function extractBundleLinks(body: string): string[] {
  return [...body.matchAll(BUNDLE_LINK_PATTERN)]
    .map((match) => match[1]?.split("#")[0] ?? "")
    .filter((href) => href.startsWith("/") || href.startsWith("."));
}

function resolveBundleLink(fromPath: string, href: string): string {
  const withoutAnchor = href.split("#")[0] ?? "";
  if (withoutAnchor.startsWith("/")) return normalizeConceptPath(withoutAnchor);

  const fromParts = fromPath.split("/");
  fromParts.pop();
  const targetParts = [...fromParts, ...withoutAnchor.split("/")];
  return normalizeConceptPath(targetParts.join("/"));
}
