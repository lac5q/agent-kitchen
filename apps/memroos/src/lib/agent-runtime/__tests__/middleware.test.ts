import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultMiddlewareFiles,
  runToolWithMiddleware,
} from "../middleware";

let tempRoot: string | null = null;

function tempHermesRoot() {
  tempRoot = mkdtempSync(path.join(tmpdir(), "hermes-runtime-"));
  return tempRoot;
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("Hermes middleware runtime", () => {
  it("creates runtime directories and runs enabled middleware around tool calls", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "browser-use",
      input: { url: "https://example.com", token: "sk-test-secret" },
      requiredFields: ["url"],
      execute: async (input) => ({ ok: true, receivedToken: input.token }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ ok: true, receivedToken: "sk-test-secret" });
    expect(result.middlewareOrder).toEqual([
      "pre/01-validate-input",
      "pre/02-redact-secrets",
      "post/01-log-outcome",
      "post/02-skill-health",
    ]);

    const outcomeLog = readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8");
    expect(outcomeLog).toContain("browser-use");
    expect(outcomeLog).not.toContain("sk-test-secret");
    expect(outcomeLog).toContain("[REDACTED]");
  });

  it("rejects invalid input before execution and alerts after three failures", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root);
    let executed = 0;

    const invalid = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "memory",
      input: {},
      requiredFields: ["content"],
      execute: async () => {
        executed += 1;
        return { ok: true };
      },
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errorType).toBe("validation_error");
    expect(executed).toBe(0);

    for (let i = 0; i < 3; i++) {
      await runToolWithMiddleware({
        hermesRoot: root,
        toolName: "browser-use",
        input: { url: "https://example.com" },
        requiredFields: ["url"],
        execute: async () => {
          throw new Error("API failed");
        },
      });
    }

    const alerts = readFileSync(path.join(root, "logs", "skill-health-alerts.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0]).skill).toBe("browser-use");
  });

  it("honors disabled and skip configuration", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root, {
      enabled: true,
      skip: ["02-redact-secrets"],
    });

    const result = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "echo ok", token: "sk-test-secret" },
      requiredFields: ["command"],
      execute: async () => ({ ok: true }),
    });

    expect(result.middlewareOrder).not.toContain("pre/02-redact-secrets");
  });

  it("handles disabled middleware failures, timeout classification, skipped health, and default roots", async () => {
    const root = tempHermesRoot();
    createDefaultMiddlewareFiles(root, { enabled: false, skip: [] });

    const disabledFailure = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "shell",
      input: { command: "sleep" },
      execute: async () => {
        throw new Error("timeout waiting for tool");
      },
    });
    expect(disabledFailure).toMatchObject({
      ok: false,
      errorType: "timeout",
      middlewareOrder: [],
    });

    writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ middleware: { enabled: true, skip: ["02-skill-health"] } }, null, 2)
    );
    const failed = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "browser-use",
      input: { url: "https://example.com" },
      requiredFields: ["url"],
      execute: async () => {
        throw "string failure";
      },
    });
    expect(failed).toMatchObject({
      ok: false,
      error: "Tool call failed",
      errorType: "api_error",
    });
    expect(failed.middlewareOrder).not.toContain("post/02-skill-health");

    const oldHome = process.env.HOME;
    const home = mkdtempSync(path.join(tmpdir(), "hermes-home-"));
    process.env.HOME = home;
    await runToolWithMiddleware({
      toolName: "default-root",
      input: { value: "ok" },
      execute: () => "ok",
    });
    expect(existsSync(path.join(home, ".hermes", "logs", "tool-outcomes.jsonl"))).toBe(true);
    process.env.HOME = oldHome;
    rmSync(home, { recursive: true, force: true });

    writeFileSync(path.join(root, "middleware", "secret-patterns.json"), "{not-json");
    const redacted = await runToolWithMiddleware({
      hermesRoot: root,
      toolName: "redact-defaults",
      input: { authorization: "Bearer abc.def" },
      execute: () => "ok",
    });
    expect(redacted.ok).toBe(true);
    expect(readFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), "utf8")).toContain("[REDACTED]");
  });
});
