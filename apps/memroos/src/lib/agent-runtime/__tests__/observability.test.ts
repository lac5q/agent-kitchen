import fs from "fs";
import path from "path";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildObservabilityModel,
  renderObservabilityHtml,
  writeObservabilityDashboard,
  type RuntimeOutcome,
} from "../observability";

let tempRoot: string | null = null;

function tempHermes(): string {
  tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-obs-"));
  return tempRoot;
}

function writeOutcomes(root: string, outcomes: RuntimeOutcome[]): void {
  const logs = path.join(root, "logs");
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(
    path.join(logs, "tool-outcomes.jsonl"),
    outcomes.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("observability model", () => {
  it("returns empty sessions and a 100% baseline when no outcomes exist", () => {
    const root = tempHermes();
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    const model = buildObservabilityModel(root);

    expect(model.sessions).toEqual([]);
    expect(model.summary).toEqual({
      sessions: 0,
      toolCalls: 0,
      errors: 0,
      errorRate: 0,
      byTool: {},
    });
  });

  it("parses valid outcomes, computes error rate, and groups by tool", () => {
    const root = tempHermes();
    writeOutcomes(root, [
      { timestamp: "2026-07-18T12:00:00.000Z", tool: "browser-use", success: true, duration_ms: 50 },
      { timestamp: "2026-07-18T12:00:01.000Z", tool: "browser-use", success: false, errorType: "timeout", duration_ms: 1000 },
      { timestamp: "2026-07-18T12:00:02.000Z", tool: "shell", success: true, duration_ms: 25 },
    ]);

    const model = buildObservabilityModel(root);

    expect(model.summary.toolCalls).toBe(3);
    expect(model.summary.errors).toBe(1);
    expect(model.summary.errorRate).toBeCloseTo(1 / 3, 5);
    expect(model.summary.byTool).toEqual({
      "browser-use": { total: 2, errors: 1 },
      shell: { total: 1, errors: 0 },
    });
  });

  it("returns an empty outcomes array when the jsonl file is missing", () => {
    const root = tempHermes();
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    const model = buildObservabilityModel(root);
    expect(model.summary.toolCalls).toBe(0);
  });

  it("returns no outcomes when the jsonl file contains only malformed JSON", () => {
    const root = tempHermes();
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "logs", "tool-outcomes.jsonl"),
      "this is not json\nanother bad line\n",
    );
    const model = buildObservabilityModel(root);
    expect(model.summary.toolCalls).toBe(0);
    expect(model.sessions).toEqual([]);
  });

  it("ignores blank lines mixed in with valid outcome JSON", () => {
    const root = tempHermes();
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    const entries = [
      { timestamp: "2026-07-18T12:00:00.000Z", tool: "shell", success: true, duration_ms: 10 },
      "",
      { timestamp: "2026-07-18T12:00:02.000Z", tool: "shell", success: false, duration_ms: 20 },
    ];
    fs.writeFileSync(
      path.join(root, "logs", "tool-outcomes.jsonl"),
      entries.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n") + "\n",
    );

    const model = buildObservabilityModel(root);
    expect(model.summary.toolCalls).toBe(2);
    expect(model.summary.errors).toBe(1);
  });

  it("caps sessions at the most recent 20 outcomes and carries a per-session health score", () => {
    const root = tempHermes();
    const outcomes: RuntimeOutcome[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      tool: "shell",
      success: i % 5 !== 0,
      duration_ms: 250,
    }));
    writeOutcomes(root, outcomes);

    const model = buildObservabilityModel(root);

    expect(model.summary.toolCalls).toBe(30);
    expect(model.sessions).toHaveLength(20);
    expect(model.sessions[0]?.startedAt).toBe(outcomes[10]?.timestamp);
    expect(model.sessions.at(-1)?.startedAt).toBe(outcomes.at(-1)?.timestamp);
    expect(model.sessions[0]?.health.score).toBeTypeOf("number");
    expect(model.sessions[0]?.health.reason).toBeTypeOf("string");
  });

  it("drops the score below 50 and uses the failure reason when many tools fail", () => {
    const root = tempHermes();
    writeOutcomes(root, [
      { timestamp: "2026-07-18T12:00:00.000Z", tool: "a", success: false, duration_ms: 5000 },
      { timestamp: "2026-07-18T12:00:01.000Z", tool: "b", success: false, duration_ms: 5000 },
      { timestamp: "2026-07-18T12:00:02.000Z", tool: "c", success: false, duration_ms: 5000 },
      { timestamp: "2026-07-18T12:00:03.000Z", tool: "d", success: true, duration_ms: 5000 },
    ]);

    const model = buildObservabilityModel(root);
    expect(model.sessions.length).toBe(4);
    expect(model.sessions.some((session) => session.health.score < 50)).toBe(true);
    expect(
      model.sessions
        .filter((session) => session.health.score < 50)
        .every((session) => session.health.reason.includes("tool failures")),
    ).toBe(true);
  });
});

describe("renderObservabilityHtml", () => {
  it("escapes <, >, and \" characters in the rendered HTML", () => {
    const root = tempHermes();
    writeOutcomes(root, [
      {
        timestamp: "2026-07-18T12:00:00.000Z",
        tool: '<script>alert("x")</"\\script>',
        success: true,
        duration_ms: 50,
      },
    ]);

    const html = renderObservabilityHtml(root);
    // The HTML rendering for the session row inserts a single-quoted attribute
    // around the session id, and the tool name is HTML-escaped.
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/&quot;\\script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("escapes the apostrophe (') character to &#39;", () => {
    const root = tempHermes();
    writeOutcomes(root, [
      {
        timestamp: "2026-07-18T12:00:00.000Z",
        tool: "react-jsx-runtime's tools",
        success: true,
        duration_ms: 50,
      },
    ]);

    const html = renderObservabilityHtml(root);
    expect(html).toContain("react-jsx-runtime&#39;s tools");
    expect(html).not.toContain("react-jsx-runtime's tools</small>");
  });

  it("escapes & characters in the rendered HTML", () => {
    const root = tempHermes();
    writeOutcomes(root, [
      {
        timestamp: "2026-07-18T12:00:00.000Z",
        tool: "shell & make",
        success: true,
        duration_ms: 50,
      },
    ]);

    const html = renderObservabilityHtml(root);
    expect(html).toContain("shell &amp; make");
  });

  it("renders the empty-state copy when there are no sessions", () => {
    const root = tempHermes();
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });

    const html = renderObservabilityHtml(root);
    expect(html).toContain("<p>No sessions yet.</p>");
    expect(html).toContain("<title>Hermes Runtime Observability</title>");
  });

  it("renders sessions and escapes < that appears in the JSON payload", () => {
    const root = tempHermes();
    // Write a session with a tool name that contains a literal '<' so the JSON
    // payload includes a '<' that must be escaped to \u003c in the script body.
    const filePath = path.join(root, "logs", "tool-outcomes.jsonl");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        timestamp: "2026-07-18T12:00:00.000Z",
        tool: "<custom>",
        success: true,
        duration_ms: 100,
      }) + "\n",
    );

    const html = renderObservabilityHtml(root);
    expect(html).toContain("onclick=\"selectSession('session-1')\"");
    expect(html).toContain("Runtime Sessions");
    expect(html).toMatch(/<h2>1<\/h2>/);
    // The on-page script payload replaces < with \u003c in the JSON literal.
    expect(html).toContain("\\u003c");
    // Error rate of 0% should appear when all successes
    expect(html).toContain("0%");
  });
});

describe("writeObservabilityDashboard", () => {
  it("creates the output directory and writes the rendered HTML to disk", () => {
    const root = tempHermes();
    const outputPath = path.join(root, "custom", "nested", "dashboard.html");

    const written = writeObservabilityDashboard(root, outputPath);

    expect(written).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
    const contents = readFileSync(outputPath, "utf8");
    expect(contents).toContain("<title>Hermes Runtime Observability</title>");
  });

  it("defaults to <hermesRoot>/observability/index.html", () => {
    const root = tempHermes();
    const written = writeObservabilityDashboard(root);

    expect(written).toBe(path.join(root, "observability", "index.html"));
    expect(fs.existsSync(written)).toBe(true);
  });
});
