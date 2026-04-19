// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-"));
  process.env.OPENCLAW_QUEUE_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  delete process.env.OPENCLAW_QUEUE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const task = {
  task_id: "task-xyz-001",
  context_id: "ctx-abc-002",
  from_agent: "kitchen",
  to_agent: "alba",
  task_summary: "Coordinate morning standup",
  priority: 3,
  dispatched_at: "2026-04-19T09:00:00Z",
};

describe("openclawAdapter", () => {
  it("drops a JSON envelope in the queue dir", async () => {
    const { openclawAdapter } = await import("../openclaw-adapter");
    const result = await openclawAdapter.dispatch(task);
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe("pushed");
    const files = await fs.readdir(tmpDir);
    expect(files).toContain(`${task.task_id}.json`);
    const content = JSON.parse(
      await fs.readFile(path.join(tmpDir, `${task.task_id}.json`), "utf-8")
    );
    expect(content.task_id).toBe(task.task_id);
    expect(content.context_id).toBe(task.context_id);
    expect(content.version).toBe("1");
  });

  it("is idempotent — dispatching twice overwrites, no extra files", async () => {
    const { openclawAdapter } = await import("../openclaw-adapter");
    await openclawAdapter.dispatch(task);
    await openclawAdapter.dispatch(task);
    const files = await fs.readdir(tmpDir);
    expect(files.filter((f) => f.startsWith(task.task_id))).toHaveLength(1);
  });

  it("returns accepted:false when queue dir is unwritable", async () => {
    process.env.OPENCLAW_QUEUE_DIR = "/dev/null/not-a-dir/queue";
    vi.resetModules();
    const { openclawAdapter } = await import("../openclaw-adapter");
    const result = await openclawAdapter.dispatch(task);
    expect(result.accepted).toBe(false);
    expect(result.mode).toBe("rejected");
  });
});
