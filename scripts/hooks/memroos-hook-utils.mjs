#!/usr/bin/env node
import { extractStructuredCapture } from "../observe-session-extraction.mjs";

const MAX_TEXT = 2400;

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      if (raw.length < 262144) raw += chunk;
    });
    process.stdin.on("end", () => resolve(raw));
  });
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstString(record, keys) {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return "";
}

function branchFrom(record) {
  return firstString(record, ["branch", "gitBranch", "git_branch"]);
}

function repoFrom(record) {
  return firstString(record, ["repo", "repository", "repoPath", "repo_path", "project", "cwd"]);
}

function sessionFrom(record) {
  return firstString(record, ["sessionId", "session_id", "runId", "run_id"]);
}

function taskFrom(record) {
  return firstString(record, ["task", "goal", "goalText", "prompt", "message", "summary"]);
}

function eventPayload(record) {
  if (Array.isArray(record.events)) return record.events;
  if (Array.isArray(record.messages)) return record.messages;
  if (typeof record.transcript === "string") return record.transcript;
  return record;
}

function jsonInput(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return asRecord(parsed);
  } catch {
    return {};
  }
}

function briefBody(record) {
  const repo = repoFrom(record) || process.env.MEMROOS_REPO || process.cwd();
  const project = firstString(record, ["project"]) || repo;
  const task = taskFrom(record) || `Session start in ${project}`;
  const cwd = firstString(record, ["cwd", "workingDirectory", "working_directory"]) || process.cwd();
  const branch = branchFrom(record);
  const entities = [
    branch ? `branch:${branch}` : "",
    cwd ? `cwd:${cwd}` : "",
    firstString(record, ["issue", "pr", "pullRequest"]),
  ].filter(Boolean);
  return {
    task: task.slice(0, 500),
    repo: repo.slice(0, 200),
    project: project.slice(0, 120),
    entities,
    cwd: cwd.slice(0, 500),
    timing: "before_plan",
    runId: sessionFrom(record) || process.env.MEMROOS_RUN_ID || undefined,
    taskId: firstString(record, ["taskId", "task_id"]) || null,
  };
}

function captureBody(record) {
  const runtime = firstString(record, ["runtime", "harness"]) || process.env.MEMROOS_AGENT_RUNTIME || "other";
  const sourceAgentId =
    firstString(record, ["sourceAgentId", "source_agent_id", "agentId", "agent_id"]) ||
    process.env.MEMROOS_AGENT_ID ||
    (process.env.MEMROOS_AGENT_API_KEY ? "" : runtime);
  const sessionId = sessionFrom(record) || process.env.MEMROOS_SESSION_ID || "";
  if (!sourceAgentId) return { skip: true, reason: "missing_agent_id" };
  if (!sessionId) return { skip: true, reason: "missing_session_id" };

  const structured = extractStructuredCapture(eventPayload(record));
  const summary = firstString(record, ["summary", "goal", "task", "message"]) || structured.summary;
  const metadata = {
    hook: "capture-gate",
    hookPhase: firstString(record, ["phase", "event", "reason"]) || "stop",
    branch: branchFrom(record) || null,
    cwd: firstString(record, ["cwd", "workingDirectory", "working_directory"]) || process.cwd(),
    repo: repoFrom(record) || process.env.MEMROOS_REPO || null,
    entities: structured.entities,
    structuredExtraction: "v2",
  };
  return {
    sourceAgentId,
    runtime,
    project: firstString(record, ["project"]) || null,
    repoPath: firstString(record, ["repoPath", "repo_path", "cwd"]) || null,
    sessionId,
    taskId: firstString(record, ["taskId", "task_id"]) || null,
    summary: summary.slice(0, MAX_TEXT),
    decisionIntent: structured.decisions.length > 0 ? { decisions: structured.decisions } : undefined,
    sources: structured.entities,
    files: structured.files,
    commands: structured.commands,
    errors: structured.errors,
    verification: structured.verification,
    events: structured.events,
    captureDepth: process.env.MEMROOS_CAPTURE_DEPTH || "relevant",
    metadata,
  };
}

function digestBody(raw) {
  try {
    const response = asRecord(JSON.parse(raw || "{}"));
    const items = Array.isArray(response.items) ? response.items : [];
    const lines = ["Prior work pointer (fetch refs only):"];
    for (const item of items.slice(0, 5)) {
      const row = asRecord(item);
      const title = firstString(row, ["title"]) || "Related prior work";
      const oneLiner = firstString(row, ["one_liner", "oneLiner"]);
      const ref = firstString(row, ["fetch_ref", "fetchRef"]);
      lines.push(`- ${title}${oneLiner ? ` — ${oneLiner}` : ""}${ref ? ` (${ref})` : ""}`);
    }
    const words = lines.join("\n").split(/\s+/).filter(Boolean);
    return words.length <= 600 ? lines.join("\n") : words.slice(0, 600).join(" ");
  } catch {
    return "";
  }
}

function skipReason(raw) {
  try {
    const value = asRecord(JSON.parse(raw || "{}"));
    return value.skip === true ? String(value.reason || "skipped") : "";
  } catch {
    return "";
  }
}

const command = process.argv[2];
const input = await readStdin();
if (command === "brief") {
  process.stdout.write(JSON.stringify(briefBody(jsonInput(input))));
} else if (command === "capture") {
  process.stdout.write(JSON.stringify(captureBody(jsonInput(input))));
} else if (command === "digest") {
  process.stdout.write(digestBody(input));
} else if (command === "skip-reason") {
  process.stdout.write(skipReason(input));
}
