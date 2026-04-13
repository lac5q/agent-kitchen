import { readFile } from "fs/promises";

export interface FailureEntry {
  timestamp?: string;
  agent_id?: string;
  error_type?: string;
}

/**
 * Parse failures.log using a streaming brace-depth extractor.
 * Handles both compact single-line JSON and multi-line pretty-printed JSON objects.
 * A naive splitlines + JSON.parse approach would break on multi-line entries.
 *
 * Returns [] if the file is absent, empty, or unreadable — never rejects.
 */
export async function parseFailuresLog(filepath: string): Promise<FailureEntry[]> {
  let content: string;
  try {
    content = await readFile(filepath, "utf-8");
  } catch {
    // ENOENT, EACCES, or any other read error — return empty gracefully
    return [];
  }

  if (!content.trim()) return [];

  const entries: FailureEntry[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Advance to the next opening brace
    while (i < len && content[i] !== "{") i++;
    if (i >= len) break;

    // Walk forward tracking brace depth, respecting string literals
    const start = i;
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    while (i < len) {
      const ch = content[i];

      if (escapeNext) {
        escapeNext = false;
        i++;
        continue;
      }

      if (ch === "\\" && inString) {
        escapeNext = true;
        i++;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        i++;
        continue;
      }

      if (!inString) {
        if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) {
            // Complete JSON object found — attempt to parse
            const candidate = content.slice(start, i + 1);
            try {
              const parsed = JSON.parse(candidate) as FailureEntry;
              entries.push(parsed);
            } catch {
              // Malformed object — skip
            }
            i++;
            break;
          }
        }
      }

      i++;
    }

    // If we exited the inner loop without finding the closing brace (unterminated)
    // then depth > 0 and we've consumed to EOF — the outer while will exit naturally
  }

  return entries;
}

/**
 * Aggregate failure entries by agent_id and error_type.
 * disk_critical entries are ALWAYS excluded (defense-in-depth; also filtered upstream).
 * Returns empty objects when entries is empty — never undefined/null.
 */
export function aggregateFailures(entries: FailureEntry[]): {
  failuresByAgent: Record<string, number>;
  failuresByErrorType: Record<string, number>;
} {
  const failuresByAgent: Record<string, number> = {};
  const failuresByErrorType: Record<string, number> = {};

  for (const entry of entries) {
    // Strict lowercase match — disk_critical variants like DISK_CRITICAL remain visible
    if (entry.error_type === "disk_critical") continue;

    const agent = entry.agent_id ?? "unknown";
    failuresByAgent[agent] = (failuresByAgent[agent] ?? 0) + 1;

    const errType = entry.error_type ?? "unknown";
    failuresByErrorType[errType] = (failuresByErrorType[errType] ?? 0) + 1;
  }

  return { failuresByAgent, failuresByErrorType };
}
