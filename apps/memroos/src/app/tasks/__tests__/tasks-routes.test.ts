// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { A2aError } from "@/lib/a2a/errors";

const mocks = vi.hoisted(() => ({
  agent: { id: "agent-1", name: "Agent One" },
  listA2aTasks: vi.fn(),
  getA2aTaskForAgent: vi.fn(),
  cancelA2aTask: vi.fn(),
  subscribeA2aTask: vi.fn(),
}));

vi.mock("@/lib/agent-registry", () => ({
  authenticateAgentHeaders: vi.fn(() => mocks.agent),
}));

vi.mock("@/lib/a2a/task-service", () => ({
  listA2aTasks: mocks.listA2aTasks,
  getA2aTaskForAgent: mocks.getA2aTaskForAgent,
  cancelA2aTask: mocks.cancelA2aTask,
  subscribeA2aTask: mocks.subscribeA2aTask,
}));

describe("A2A task route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists tasks for the authenticated agent", async () => {
    mocks.listA2aTasks.mockResolvedValueOnce([{ id: "task-1", status: { state: "submitted" } }]);
    const { GET } = await import("../route");

    const res = await GET(new Request("https://example.test/tasks"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.listA2aTasks).toHaveBeenCalledWith(mocks.agent);
    expect(json.tasks).toEqual([{ id: "task-1", status: { state: "submitted" } }]);
    expect(json.timestamp).toEqual(expect.any(String));
  });

  it("maps unexpected list failures to the generic A2A internal response", async () => {
    mocks.listA2aTasks.mockRejectedValueOnce(new Error("database unavailable"));
    const { GET } = await import("../route");

    const res = await GET(new Request("https://example.test/tasks"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL");
    expect(json.error).toBe("A2A task listing failed");
  });

  it("gets an individual task from awaited params", async () => {
    mocks.getA2aTaskForAgent.mockResolvedValueOnce({ id: "task-2", status: { state: "working" } });
    const { GET } = await import("../[id]/route");

    const res = await GET(new Request("https://example.test/tasks/task-2"), {
      params: Promise.resolve({ id: "task-2" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.getA2aTaskForAgent).toHaveBeenCalledWith(mocks.agent, "task-2");
    expect(await res.json()).toMatchObject({ id: "task-2" });
  });

  it("returns typed A2A errors from task lookup", async () => {
    mocks.getA2aTaskForAgent.mockRejectedValueOnce(new A2aError("NOT_FOUND", "A2A task not found"));
    const { GET } = await import("../[id]/route");

    const res = await GET(new Request("https://example.test/tasks/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND", error: "A2A task not found" });
  });

  it("decodes cancel route ids from the colon action URL", async () => {
    mocks.cancelA2aTask.mockResolvedValueOnce({ id: "task/with/slash", status: { state: "canceled" } });
    const { POST } = await import("../[id]:cancel/route");

    const res = await POST(new Request("https://example.test/tasks/task%2Fwith%2Fslash:cancel", { method: "POST" }));

    expect(res.status).toBe(200);
    expect(mocks.cancelA2aTask).toHaveBeenCalledWith(mocks.agent, "task/with/slash");
    expect(await res.json()).toMatchObject({ status: { state: "canceled" } });
  });

  it("streams task and event payloads for subscriptions", async () => {
    mocks.subscribeA2aTask.mockResolvedValueOnce({
      task: { id: "task-3", status: { state: "submitted" } },
      events: [{ eventType: "task.created", sequence: 1 }],
    });
    const { POST } = await import("../[id]:subscribe/route");

    const res = await POST(new Request("https://example.test/tasks/task-3:subscribe", { method: "POST" }));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(mocks.subscribeA2aTask).toHaveBeenCalledWith(mocks.agent, "task-3");
    expect(body).toContain("event: task.update");
    expect(body).toContain("\"task.created\"");
  });

  it("maps unexpected subscribe failures to the generic A2A internal response", async () => {
    mocks.subscribeA2aTask.mockRejectedValueOnce(new Error("stream failed"));
    const { POST } = await import("../[id]:subscribe/route");

    const res = await POST(new Request("https://example.test/tasks/task-3:subscribe", { method: "POST" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("A2A task subscription failed");
  });
});
