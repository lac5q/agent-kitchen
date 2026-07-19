import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultMiddlewareFiles,
  runToolWithMiddleware,
} from "../middleware";

let tempRoot: string | null = null;

function tempHermesRoot(): string {
  tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-runtime-branches-"));
  return tempRoot;
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("middleware disabled path", () => {
  it("returns a successful result without redaction when middleware is disabled", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root, { enabled: false, skip: [] });

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { token: "sk-direct-secret" },
      execute: async (input) => ({ ok: true, token: input.token }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ ok: true, token: "sk-direct-secret" });
    expect(result.middlewareOrder).toEqual([]);
  });

  it("captures failures with the api_error type when middleware is disabled", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root, { enabled: false, skip: [] });

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: {},
      execute: async () => {
        throw new Error("kaboom");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("kaboom");
    expect(result.errorType).toBe("api_error");
    expect(result.middlewareOrder).toEqual([]);
  });
});

describe("middleware config parsing", () => {
  it("defaults to enabled when config.json is missing", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    // Remove the config.json to force the fallback default
    rmSync(path.join(root, "config.json"));

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok" },
      execute: async () => ({ ok: true }),
    });

    expect(result.ok).toBe(true);
    // All four default middleware steps should have run
    expect(result.middlewareOrder).toEqual([
      "pre/01-validate-input",
      "pre/02-redact-secrets",
      "post/01-log-outcome",
      "post/02-skill-health",
    ]);
  });

  it("uses defaults when config.json is malformed", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    writeFileSync(path.join(root, "config.json"), "{not json}");

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok" },
      execute: async () => ({ ok: true }),
    });

    expect(result.ok).toBe(true);
    expect(result.middlewareOrder).toContain("pre/01-validate-input");
  });

  it("falls back to default secret patterns when secret-patterns.json is malformed", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    // Replace the patterns file with malformed content
    writeFileSync(
      path.join(root, "middleware", "secret-patterns.json"),
      "{not valid}",
    );

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "browser-use",
      input: { token: "sk-test-secret", url: "https://x" },
      execute: async (input) => ({ ok: true, token: input.token }),
    });

    expect(result.ok).toBe(true);
    const log = readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8");
    expect(log).toContain("[REDACTED]");
    expect(log).not.toContain("sk-test-secret");
  });

  it("uses custom secret patterns from disk when provided", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    writeFileSync(
      path.join(root, "middleware", "secret-patterns.json"),
      JSON.stringify(["CUSTOM_[A-Z0-9]+"]),
    );

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "browser-use",
      input: { token: "CUSTOM_ABC123XYZ", url: "https://x" },
      execute: async (input) => ({ ok: true, token: input.token }),
    });

    expect(result.ok).toBe(true);
    const log = readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8");
    expect(log).toContain("[REDACTED]");
    expect(log).not.toContain("CUSTOM_ABC123XYZ");
  });

  it("respects skip configuration on a non-input middleware step", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root, { enabled: true, skip: ["log-outcome"] });

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok" },
      execute: async () => ({ ok: true }),
    });

    expect(result.ok).toBe(true);
    expect(result.middlewareOrder).not.toContain("post/01-log-outcome");
  });

  it("uses enabled=false from a valid config file", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ middleware: { enabled: false, skip: [] } }),
    );

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok" },
      execute: async () => ({ ok: true }),
    });

    expect(result.ok).toBe(true);
    expect(result.middlewareOrder).toEqual([]);
  });
});

describe("middleware error classification", () => {
  it("classifies timeouts as the timeout error type", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "browser-use",
      input: { url: "https://example.com" },
      requiredFields: ["url"],
      execute: async () => {
        throw new Error("Request timeout exceeded 5000ms");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe("timeout");
  });

  it("captures non-Error throws as the literal Tool call failed message", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    const nonError: unknown = "literal string thrown";
    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok" },
      execute: async () => {
        throw nonError;
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Tool call failed");
    expect(result.errorType).toBe("api_error");
  });
});

describe("middleware redactor", () => {
  it("redacts default-pattern secrets that appear nested in arrays and objects", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "scraper",
      input: {
        url: "https://example.com",
        cookies: ["session=ok", "sk-nested-1"],
        headers: { authorization: "Bearer deep-secret", "x-other": "plain" },
        meta: { nested: "ak_secret_value_here", benign: "ok" },
      },
      execute: async () => ({ ok: true }),
    });

    const log = readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8");
    expect(log).not.toContain("sk-nested-1");
    expect(log).not.toContain("deep-secret");
    expect(log).not.toContain("ak_secret_value_here");
    expect(log).toContain("[REDACTED]");
    // Plain values should remain untouched
    expect(log).toContain("plain");
    expect(log).toContain("benign");
  });

  it("leaves primitives (numbers, booleans, null) untouched by the redactor", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "counter",
      input: { count: 5, active: true, label: null },
      execute: async () => ({ ok: true }),
    });

    const log = readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8");
    expect(log).toContain("\"count\":5");
    expect(log).toContain("\"active\":true");
    expect(log).toContain("\"label\":null");
  });
});

describe("middleware skill health", () => {
  it("writes success and failure entries through runToolWithMiddleware", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "flaky-tool",
      input: { payload: "go" },
      requiredFields: ["payload"],
      execute: async () => ({ ok: true }),
    });

    await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "flaky-tool",
      input: { payload: "go" },
      requiredFields: ["payload"],
      execute: async () => {
        throw new Error("nope");
      },
    });

    const state = JSON.parse(
      readFileSync(path.join(root, "logs", "skill-health-state.json"), "utf8"),
    ) as Record<string, { failures: number; alerted: boolean }>;
    expect(state["flaky-tool"]).toEqual({ failures: 1, alerted: false });
  });

  it("resets the failure counter after a successful call and clears the alerted flag", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    // Two failures (below the alert threshold)
    for (let i = 0; i < 2; i++) {
      await runToolWithMiddleware({
        hermesRoot: root,
        toolName: "recovering",
        input: { payload: "go" },
        execute: async () => {
          throw new Error("nope");
        },
      });
    }

    // A subsequent success should reset the counter to 0
    await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "recovering",
      input: { payload: "go" },
      execute: async () => ({ ok: true }),
    });

    const state = JSON.parse(
      readFileSync(path.join(root, "logs", "skill-health-state.json"), "utf8"),
    ) as Record<string, { failures: number; alerted: boolean }>;
    expect(state["recovering"]).toEqual({ failures: 0, alerted: false });
  });
});
