/**
 * Licensed data non-distribution guard (VAL-RETR-004).
 *
 * The benchmark runner writes ONLY:
 *   - normalized task IDs
 *   - content hashes (sha256 over task + corpus)
 *   - aggregate metrics + per-task scores
 *   - adapter receipts (id-level metadata)
 *
 * It MUST NEVER write:
 *   - raw licensed conversations or QA from LoCoMo / LongMemEval / V2
 *   - sensitive answers, full text, or PII
 *   - secrets, credentials, signing material
 *
 * This module provides:
 *   - A normalized-output sanitizer that strips raw text fields before
 *     writing the report.
 *   - A blacklist of forbidden keys that must not appear in reports.
 *   - Sentinel scanning over arbitrary JSON values.
 */

const FORBIDDEN_REPORT_KEYS = new Set<string>([
  // raw text bodies must not appear in reports
  "text",
  "raw_text",
  "raw_conversation",
  "raw_message",
  "conversation",
  "session_text",
  "corpus_text",
  // sensitive fields
  "password",
  "api_key",
  "secret",
  "token",
  "private_key",
  "credential",
  // licensed data sentinels (matched as substrings of any value)
]);

const FORBIDDEN_VALUE_SENTINELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, label: "private_key_block" },
  { pattern: /ssh-rsa AAAA[0-9A-Za-z+/]+/, label: "ssh_public_or_private_blob" },
  { pattern: /\bpassword\s*[:=]\s*\S+/i, label: "password_literal" },
  // LoCoMo sentinel: any conversation that begins with "[locomo-raw]"
  { pattern: /^\s*\[locomo-raw\]/i, label: "locomo_raw_marker" },
  { pattern: /^\s*\[longmemeval-raw\]/i, label: "longmemeval_raw_marker" },
];

export interface RedactionReport {
  ok: boolean;
  violations: Array<{ path: string; reason: string; value: string }>;
}

/**
 * Walk an arbitrary JSON-compatible value and report any forbidden keys
 * or sensitive sentinel matches.
 */
export function scanForForbiddenContent(value: unknown, path = "$"): RedactionReport {
  const violations: RedactionReport["violations"] = [];
  walk(value, path, (currentPath, currentValue) => {
    // 1) Forbidden key names
    const lastSegment = currentPath.split(".").pop() ?? "";
    if (FORBIDDEN_REPORT_KEYS.has(lastSegment) && currentValue !== null && currentValue !== undefined) {
      violations.push({
        path: currentPath,
        reason: "forbidden_key",
        value: String(currentValue).slice(0, 64),
      });
    }
    // 2) Sentinel substring matches in any string value
    if (typeof currentValue === "string") {
      for (const sentinel of FORBIDDEN_VALUE_SENTINELS) {
        if (sentinel.pattern.test(currentValue)) {
          violations.push({
            path: currentPath,
            reason: sentinel.label,
            value: currentValue.slice(0, 64),
          });
        }
      }
    }
  });
  return { ok: violations.length === 0, violations };
}

function walk(
  value: unknown,
  path: string,
  visit: (path: string, value: unknown) => void,
): void {
  visit(path, value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`, visit);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, `${path}.${k}`, visit);
    }
  }
}

/**
 * Strip raw text bodies from a normalized report before serialization.
 * Returns a sanitized deep clone safe to write to disk.
 */
export function redactReport<T>(report: T): T {
  return cloneAndRedact(report) as T;
}

function cloneAndRedact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => cloneAndRedact(v));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Drop raw text payloads from corpus fields.
      if (k === "text" || k === "raw_text" || k === "corpus" || k === "raw_conversation") {
        // Replace with a non-sensitive marker preserving IDs only.
        if (Array.isArray(v)) {
          out[k] = "[redacted]";
        } else if (typeof v === "string") {
          out[k] = "[redacted]";
        } else {
          out[k] = "[redacted]";
        }
        continue;
      }
      out[k] = cloneAndRedact(v);
    }
    return out;
  }
  return value;
}

/**
 * The benchmark runner must only emit permitted output paths. Anything
 * outside this allowlist (e.g., source datasets, raw conversation dumps)
 * must NOT be written. This helper returns the canonical output path
 * for a given (dataset, adapter, lane) tuple.
 */
export function canonicalOutputPath(args: {
  resultsDir: string;
  dataset: string;
  adapter: string;
  lane?: string;
  extension?: "json" | "md";
}): string {
  const ext = args.extension ?? "json";
  const lane = args.lane ?? "external_retrieval";
  const filename = `${args.dataset}-${args.adapter}-${lane}-latest.${ext}`;
  return `${args.resultsDir.replace(/\/+$/, "")}/${filename}`;
}
