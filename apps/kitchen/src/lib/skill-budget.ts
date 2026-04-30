import { readFile, readdir } from "fs/promises";
import path from "path";

export type SkillSourceType = "runtime" | "source" | "plugin" | "configured";
export type SkillBudgetStatus = "ok" | "watch" | "over";

export interface SkillCatalogEntry {
  name: string;
  description: string;
  path: string;
  sourceId: string;
  sourceType: SkillSourceType;
}

export interface SkillSourceSummary {
  id: string;
  path: string;
  type: SkillSourceType;
  skillCount: number;
  metadataChars: number;
  averageDescriptionChars: number;
}

export interface SkillBudgetReport {
  status: SkillBudgetStatus;
  budgetTokens: number;
  metadataTokens: number;
  metadataChars: number;
  utilization: number;
  totalSkills: number;
  uniqueSkills: number;
  duplicateSkills: string[];
  averageDescriptionChars: number;
  longestDescriptions: Array<{ name: string; chars: number; sourceId: string }>;
  sources: SkillSourceSummary[];
  recommendations: string[];
}

interface SkillRoot {
  id: string;
  path: string;
  type: SkillSourceType;
  maxDepth: number;
}

export interface ReadSkillBudgetOptions {
  home?: string;
  budgetTokens?: number;
  roots?: SkillRoot[];
  openclawConfigPath?: string;
  codexPluginCachePath?: string;
}

const DEFAULT_BUDGET_TOKENS = 5440;
const WATCH_UTILIZATION = 0.85;

function uniqueByPath(roots: SkillRoot[]): SkillRoot[] {
  const seen = new Set<string>();
  const unique: SkillRoot[] = [];

  for (const root of roots) {
    const key = path.resolve(root.path);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(root);
  }

  return unique;
}

function parseFrontmatter(raw: string): { name: string | null; description: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: null, description: "" };

  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/m);
  const description = frontmatter.match(
    /^description:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/m
  );

  return {
    name: (name?.[1] || name?.[2] || name?.[3] || null)?.trim() ?? null,
    description: (description?.[1] || description?.[2] || description?.[3] || "").trim(),
  };
}

function metadataChars(entry: Pick<SkillCatalogEntry, "name" | "description">): number {
  return entry.name.length + entry.description.length + 4;
}

async function discoverSkillFiles(root: SkillRoot): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > root.maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
        continue;
      }
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walk(fullPath, depth + 1);
    }
  }

  await walk(root.path, 0);
  return files;
}

async function readSkillEntries(root: SkillRoot): Promise<SkillCatalogEntry[]> {
  const files = await discoverSkillFiles(root);
  const entries: SkillCatalogEntry[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(file, "utf8");
      const frontmatter = parseFrontmatter(raw);
      const fallbackName = path.basename(path.dirname(file));
      entries.push({
        name: frontmatter.name || fallbackName,
        description: frontmatter.description,
        path: file,
        sourceId: root.id,
        sourceType: root.type,
      });
    } catch {
      // A skill file may be unreadable or move during a scan; skip it.
    }
  }

  return entries;
}

async function readOpenClawSkillRoots(configPath: string): Promise<SkillRoot[]> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as {
      skills?: { load?: { extraDirs?: unknown } };
    };
    const extraDirs = parsed.skills?.load?.extraDirs;
    if (!Array.isArray(extraDirs)) return [];
    return extraDirs
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value, index) => ({
        id: `openclaw-extra-${index + 1}`,
        path: value,
        type: "configured" as const,
        maxDepth: 4,
      }));
  } catch {
    return [];
  }
}

function defaultRoots(home: string): SkillRoot[] {
  const configuredRoots = process.env.SKILL_BUDGET_ROOTS?.split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value, index) => ({
      id: `env-root-${index + 1}`,
      path: value,
      type: "configured" as const,
      maxDepth: 4,
    }));

  if (configuredRoots && configuredRoots.length > 0) return configuredRoots;

  return [
    { id: "codex-runtime", path: path.join(home, ".codex", "skills"), type: "runtime", maxDepth: 4 },
    { id: "claude-runtime", path: path.join(home, ".claude", "skills"), type: "runtime", maxDepth: 4 },
    { id: "openclaw-runtime", path: path.join(home, ".openclaw", "skills"), type: "runtime", maxDepth: 4 },
    {
      id: "codex-plugin-cache",
      path: process.env.CODEX_PLUGIN_SKILLS_PATH || path.join(home, ".codex", "plugins", "cache"),
      type: "plugin",
      maxDepth: 8,
    },
  ];
}

function summarizeSources(entries: SkillCatalogEntry[]): SkillSourceSummary[] {
  const grouped = new Map<string, SkillCatalogEntry[]>();
  for (const entry of entries) {
    grouped.set(entry.sourceId, [...(grouped.get(entry.sourceId) ?? []), entry]);
  }

  return Array.from(grouped.entries())
    .map(([id, sourceEntries]) => {
      const metadata = sourceEntries.reduce((sum, entry) => sum + metadataChars(entry), 0);
      const descriptionChars = sourceEntries.reduce(
        (sum, entry) => sum + entry.description.length,
        0
      );
      const first = sourceEntries[0];
      return {
        id,
        path: path.dirname(first.path),
        type: first.sourceType,
        skillCount: sourceEntries.length,
        metadataChars: metadata,
        averageDescriptionChars: sourceEntries.length
          ? Math.round(descriptionChars / sourceEntries.length)
          : 0,
      };
    })
    .sort((a, b) => b.metadataChars - a.metadataChars);
}

export function summarizeSkillBudget(
  entries: SkillCatalogEntry[],
  budgetTokens = DEFAULT_BUDGET_TOKENS
): SkillBudgetReport {
  const byName = new Map<string, SkillCatalogEntry[]>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), entry]);
  }

  const canonicalEntries = Array.from(byName.values()).map((matches) => matches[0]);
  const metadata = canonicalEntries.reduce((sum, entry) => sum + metadataChars(entry), 0);
  const metadataTokens = Math.ceil(metadata / 4);
  const descriptionChars = canonicalEntries.reduce(
    (sum, entry) => sum + entry.description.length,
    0
  );
  const utilization = budgetTokens > 0 ? metadataTokens / budgetTokens : 0;
  const duplicateSkills = Array.from(byName.values())
    .filter((matches) => matches.length > 1)
    .map((matches) => matches[0].name)
    .sort((a, b) => a.localeCompare(b));
  const longestDescriptions = canonicalEntries
    .map((entry) => ({
      name: entry.name,
      chars: entry.description.length,
      sourceId: entry.sourceId,
    }))
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 8);

  const recommendations: string[] = [];
  if (utilization > 1) {
    recommendations.push("Reduce model-visible skill metadata before startup; current metadata exceeds the configured budget.");
  }
  if (canonicalEntries.length > 80) {
    recommendations.push("Use role-specific runtime projections instead of exposing the full shared skill catalog.");
  }
  if (duplicateSkills.length > 0) {
    recommendations.push("Dedupe duplicate skill names across source, runtime, and plugin roots before rendering prompt metadata.");
  }
  if (longestDescriptions.some((entry) => entry.chars > 180)) {
    recommendations.push("Shorten long frontmatter descriptions; keep routing descriptions under 180 characters and put details in the skill body.");
  }

  return {
    status: utilization > 1 ? "over" : utilization >= WATCH_UTILIZATION ? "watch" : "ok",
    budgetTokens,
    metadataTokens,
    metadataChars: metadata,
    utilization,
    totalSkills: entries.length,
    uniqueSkills: canonicalEntries.length,
    duplicateSkills,
    averageDescriptionChars: canonicalEntries.length
      ? Math.round(descriptionChars / canonicalEntries.length)
      : 0,
    longestDescriptions,
    sources: summarizeSources(entries),
    recommendations,
  };
}

export async function readSkillBudgetReport(
  options: ReadSkillBudgetOptions = {}
): Promise<SkillBudgetReport> {
  const home = options.home || process.env.HOME || "";
  const budgetTokens =
    options.budgetTokens ??
    Number(
      process.env.SKILL_METADATA_BUDGET_TOKENS ||
        process.env.SKILL_METADATA_BUDGET_CHARS ||
        DEFAULT_BUDGET_TOKENS
    );
  const openclawConfigPath =
    options.openclawConfigPath || path.join(home, ".openclaw", "openclaw.json");
  const roots = uniqueByPath([
    ...(options.roots ?? defaultRoots(home)),
    ...(await readOpenClawSkillRoots(openclawConfigPath)),
  ]);

  const entries = (await Promise.all(roots.map((root) => readSkillEntries(root)))).flat();
  return summarizeSkillBudget(entries, budgetTokens);
}
