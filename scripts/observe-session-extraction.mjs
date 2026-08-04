#!/usr/bin/env node
/**
 * Deterministic-first extraction for coding-agent session records.
 *
 * This module intentionally does not call an LLM. A later caller may use the
 * bounded summary as an assist input, but the structured fields are derived
 * from observable JSONL/tool records so they remain reproducible and safe to
 * use at relevant capture depth.
 */

const MAX_ITEMS = 40;
const MAX_ITEM_CHARS = 600;
const MAX_EVENTS = 80;

function bounded(value, max = MAX_ITEM_CHARS) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(items, max = MAX_ITEMS) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const value = typeof item === "string" ? bounded(item) : item;
    const key = typeof value === "string" ? value : JSON.stringify(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export function redactSecretText(input) {
  let value = String(input ?? "");
  value = value.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]");
  value = value.replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
  value = value.replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{12,})\b/g, "[REDACTED_TOKEN]");
  value = value.replace(/(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]");
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseLines(input) {
  if (Array.isArray(input)) return input.filter((item) => isRecord(item));
  if (isRecord(input)) {
    if (Array.isArray(input.events)) return input.events.filter((item) => isRecord(item));
    if (Array.isArray(input.messages)) return input.messages.filter((item) => isRecord(item));
    return [input];
  }
  const raw = String(input ?? "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const parsed = [];
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      parsed.push(isRecord(value) ? value : { text: String(value) });
    } catch {
      parsed.push({ text: line });
    }
  }
  return parsed;
}

function flattenText(value, depth = 0) {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item, depth + 1)).filter(Boolean).join(" ");
  if (!isRecord(value)) return "";
  for (const key of ["text", "content", "body", "message", "output", "stdout", "stderr", "description", "summary", "result"]) {
    if (value[key] !== undefined) {
      const text = flattenText(value[key], depth + 1);
      if (text) return text;
    }
  }
  return "";
}

function nestedValues(record) {
  return [record.input, record.arguments, record.tool_input, record.toolInput, record.parameters].filter(isRecord);
}

function fieldText(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      const text = flattenText(record[key]);
      if (text) return text;
    }
  }
  for (const nested of nestedValues(record)) {
    const text = fieldText(nested, keys);
    if (text) return text;
  }
  return "";
}

function roleOf(record) {
  return String(record.role ?? record.author ?? record.sender ?? record.type ?? record.event ?? record.kind ?? "").toLowerCase();
}

function commandValues(record, text) {
  const values = [];
  const direct = fieldText(record, ["command", "cmd", "shellCommand", "shell_command", "script"]);
  if (direct) values.push(direct);
  for (const nested of nestedValues(record)) {
    const nestedCommand = fieldText(nested, ["command", "cmd", "shellCommand", "shell_command", "script"]);
    if (nestedCommand) values.push(nestedCommand);
  }
  const toolName = String(record.name ?? record.tool ?? record.toolName ?? "").toLowerCase();
  if (toolName.includes("bash") || toolName.includes("shell") || toolName.includes("terminal") || toolName === "exec" || toolName === "run") {
    const toolText = fieldText(record, ["input", "arguments", "content", "text"]);
    if (toolText) values.push(toolText);
  }
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*\$\s+(.+)$/);
    if (match) values.push(match[1]);
  }
  return unique(values.filter((value) => !value.includes("[REDACTED")));
}

function fileValues(record, text) {
  const values = [];
  for (const key of ["file", "filePath", "file_path", "path", "targetFile", "target_file", "filename", "filename"] ) {
    const raw = record[key];
    if (typeof raw === "string") values.push(raw);
    else if (Array.isArray(raw)) values.push(...raw.map((item) => (typeof item === "string" ? item : isRecord(item) ? fieldText(item, ["path", "file", "filePath", "file_path"]) : "")));
  }
  for (const nested of nestedValues(record)) values.push(...fileValues(nested, ""));
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/(?:edited|updated|created|wrote|modified|file)\s+[`']?((?:apps|src|scripts|packages|services|integrations|\.github|\.planning|docs|tests?|test)[^`'\s,;)]*)/i);
    if (match) values.push(match[1]);
  }
  return unique(values.filter((value) => value && !/^https?:\/\//i.test(value) && !value.endsWith(".jsonl")));
}

function statusOf(record, text) {
  const raw = record.exitCode ?? record.exit_code ?? record.returnCode ?? record.return_code ?? record.status ?? record.outcome ?? "";
  const value = String(raw).toLowerCase();
  const numeric = Number(raw);
  if (raw !== "" && raw !== null && raw !== undefined && Number.isFinite(numeric)) return numeric === 0 ? "passed" : "failed";
  if (/pass|success|ok|complete|verified|green/.test(value)) return "passed";
  if (/fail|error|exception|timeout|nonzero|red/.test(value)) return "failed";
  if (/\b(pass|passed|success|successful|verified|green)\b/i.test(text)) return "passed";
  if (/\b(fail|failed|failure|error|exception|timeout|non-zero)\b/i.test(text)) return "failed";
  return "unknown";
}

function verificationEntry(command, record, text) {
  if (!command || !/(^|\s)(npm|pnpm|yarn|bun|node|npx|pytest|vitest|jest|cargo|go)\b/i.test(command) && !/(test|lint|typecheck|build|check|verify|compile)/i.test(command)) return null;
  const status = statusOf(record, text);
  if (status === "unknown") return null;
  return {
    command: bounded(redactSecretText(command)),
    status,
    ...(record.exitCode !== undefined || record.exit_code !== undefined ? { exitCode: Number(record.exitCode ?? record.exit_code) } : {}),
  };
}

function decisionLines(text, assistant) {
  if (!assistant && !/\b(?:decision|decided|choose|chosen|adopt|will use|implemented|ship)\b/i.test(text)) return [];
  return String(text).split(/\r?\n/).filter((line) =>
    /^\s*(?:#{1,4}\s*)?decision\b/i.test(line) ||
    /^\s*decided\s*:/i.test(line) ||
    /\b(?:I|we)\s+(?:decided|will use|chose|choose|adopted)\b/i.test(line)
  ).map((line) => bounded(redactSecretText(line.replace(/^\s*#+\s*/, "").replace(/^decision\s*:\s*/i, ""))));
}

function entityValues(record, text) {
  const values = [];
  for (const key of ["repo", "repository", "project", "branch", "gitBranch", "git_branch", "issue", "pr", "pullRequest"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) values.push(`${key}:${value.trim()}`);
  }
  for (const match of String(text ?? "").matchAll(/\b(?:PR|pull request|issue)\s*#?\d+|(?:^|\s)#\d+\b/gi)) values.push(match[0].trim());
  return unique(values.filter((value) => !value.includes("[REDACTED")));
}

export function extractStructuredCapture(input) {
  const records = parseLines(input);
  const decisions = [];
  const outcomes = [];
  const errors = [];
  const commands = [];
  const files = [];
  const entities = [];
  const verification = [];
  const events = [];
  const textParts = [];
  let lastCommand = "";

  for (const record of records) {
    const rawText = flattenText(record);
    const text = bounded(redactSecretText(rawText), 1600);
    const role = roleOf(record);
    const assistant = role.includes("assistant") || role.includes("model") || role.includes("agent");
    if (text) textParts.push(text);
    const recordCommands = commandValues(record, text).map((value) => bounded(redactSecretText(value)));
    commands.push(...recordCommands);
    if (recordCommands.length > 0) lastCommand = recordCommands.at(-1);
    files.push(...fileValues(record, text));
    entities.push(...entityValues(record, text));
    decisions.push(...decisionLines(text, assistant));
    for (const command of (recordCommands.length > 0 ? recordCommands : lastCommand ? [lastCommand] : [])) {
      const verificationItem = verificationEntry(command, record, text);
      if (verificationItem) verification.push(verificationItem);
    }
    const status = statusOf(record, text);
    if (status !== "unknown" && (record.outcome !== undefined || record.status !== undefined || record.exitCode !== undefined || record.exit_code !== undefined)) {
      outcomes.push(`${recordCommands[0] || lastCommand || role || "operation"} — ${status}`);
    }
    if (status === "failed" || /\b(?:error|exception|stack trace|traceback|failed|failure|timeout)\b/i.test(text)) {
      const errorText = fieldText(record, ["error", "stderr", "exception", "message"]) || text;
      if (errorText) errors.push(bounded(redactSecretText(errorText)));
    }
    if (events.length < MAX_EVENTS && (text || role)) {
      events.push({ role: role || "event", text: text.slice(0, 500) });
    }
  }

  const cleanDecisions = unique(decisions);
  const cleanCommands = unique(commands);
  const cleanFiles = unique(files);
  const cleanEntities = unique(entities);
  const cleanErrors = unique(errors);
  const cleanVerification = unique(verification);
  const cleanOutcomes = unique(outcomes);
  const summaryParts = [
    ...cleanDecisions.map((value) => `Decision: ${value}`),
    ...cleanOutcomes.map((value) => `Outcome: ${value}`),
    ...cleanVerification.map((value) => `${value.command} ${value.status}`),
    ...textParts,
  ];

  return {
    decisions: cleanDecisions,
    outcomes: cleanOutcomes,
    errors: cleanErrors,
    commands: cleanCommands,
    files: cleanFiles,
    entities: cleanEntities,
    verification: cleanVerification,
    events,
    summary: bounded(summaryParts.join(" "), 600) || "Session captured with no structured summary.",
    lineCount: records.length,
  };
}

export function extractSessionJsonl(content, sessionId = "session") {
  const structured = extractStructuredCapture(content);
  return { sessionId, ...structured };
}
