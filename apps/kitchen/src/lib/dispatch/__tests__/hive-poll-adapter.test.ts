// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hivePollAdapter } from "../hive-poll-adapter";

const task = {
  task_id: "abc-123",
  context_id: "ctx-456",
  from_agent: "kitchen",
  to_agent: "sophia",
  task_summary: "Draft blog post",
  priority: 5,
  dispatched_at: "2026-04-19T10:00:00Z",
};

describe("hivePollAdapter", () => {
  it("returns mode:queued and accepted:true unconditionally", async () => {
    const result = await hivePollAdapter.dispatch(task);
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe("queued");
    expect(result.detail).toContain(task.task_id);
  });

  it("covers all hive-poll platforms", () => {
    const platforms = Array.isArray(hivePollAdapter.platform)
      ? hivePollAdapter.platform
      : [hivePollAdapter.platform];
    expect(platforms).toContain("claude");
    expect(platforms).toContain("codex");
    expect(platforms).toContain("qwen");
    expect(platforms).toContain("gemini");
  });
});
