// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const taskMocks = vi.hoisted(() => ({
  sendA2aMessage: vi.fn(),
  getA2aTaskForAgent: vi.fn(),
  listA2aTasks: vi.fn(),
  cancelA2aTask: vi.fn(),
}));

vi.mock("../task-service", () => taskMocks);

import { dispatchA2aJsonRpc } from "../bindings";
import { A2aError } from "../errors";

describe("A2A JSON-RPC bindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskMocks.sendA2aMessage.mockResolvedValue({ id: "task-send" });
    taskMocks.getA2aTaskForAgent.mockResolvedValue({ id: "task-get" });
    taskMocks.listA2aTasks.mockResolvedValue([{ id: "task-list" }]);
    taskMocks.cancelA2aTask.mockResolvedValue({ id: "task-cancel", status: { state: "canceled" } });
  });

  it("rejects malformed and streaming JSON-RPC requests", async () => {
    await expect(dispatchA2aJsonRpc(null, [])).rejects.toThrow(A2aError);
    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "missing-method" })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: 1, method: "message/stream" })
    ).resolves.toMatchObject({
      id: 1,
      error: { code: -32000, message: expect.stringMatching(/Streaming methods/) },
    });
  });

  it("dispatches supported methods and returns JSON-RPC errors for unsupported or invalid params", async () => {
    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "send", method: "message/send", params: { message: "hi" } })
    ).resolves.toMatchObject({ id: "send", result: { id: "task-send" } });
    expect(taskMocks.sendA2aMessage).toHaveBeenCalledWith(null, { message: "hi" });

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "get", method: "tasks/get", params: { taskId: "task-1" } })
    ).resolves.toMatchObject({ id: "get", result: { id: "task-get" } });
    expect(taskMocks.getA2aTaskForAgent).toHaveBeenCalledWith(null, "task-1");

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "list", method: "tasks/list" })
    ).resolves.toMatchObject({ id: "list", result: [{ id: "task-list" }] });

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "cancel", method: "tasks/cancel", params: { id: "task-2" } })
    ).resolves.toMatchObject({ id: "cancel", result: { id: "task-cancel" } });
    expect(taskMocks.cancelA2aTask).toHaveBeenCalledWith(null, "task-2");

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "bad", method: "tasks/get", params: {} })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "unknown", method: "tasks/unknown" })
    ).resolves.toMatchObject({
      id: "unknown",
      error: { code: -32601, message: "Unsupported A2A method: tasks/unknown" },
    });
  });

  it("wraps unexpected task-service errors as internal A2A failures", async () => {
    taskMocks.listA2aTasks.mockRejectedValueOnce("database offline");

    await expect(
      dispatchA2aJsonRpc(null, { jsonrpc: "2.0", id: "list", method: "tasks/list" })
    ).rejects.toMatchObject({
      code: "INTERNAL",
      message: "A2A JSON-RPC dispatch failed",
    });
  });
});
