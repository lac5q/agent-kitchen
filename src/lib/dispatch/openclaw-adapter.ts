import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

function getQueueDir(): string {
  return (
    process.env.OPENCLAW_QUEUE_DIR ??
    path.join(os.homedir(), ".openclaw", "delivery-queue")
  );
}

interface OpenClawEnvelope {
  version: "1";
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
  hive_endpoint: string;
}

export const openclawAdapter: AgentAdapter = {
  platform: "opencode",
  name: "openclaw",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    const queueDir = getQueueDir();
    const envelope: OpenClawEnvelope = {
      version: "1",
      task_id: task.task_id,
      context_id: task.context_id,
      from_agent: task.from_agent,
      to_agent: task.to_agent,
      task_summary: task.task_summary,
      input: task.input,
      priority: task.priority,
      dispatched_at: task.dispatched_at,
      hive_endpoint:
        process.env.HIVE_PUBLIC_URL ??
        "https://kitchen.epiloguecapital.com/api/hive",
    };
    const file = path.join(queueDir, `${task.task_id}.json`);
    try {
      await fs.mkdir(queueDir, { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(envelope, null, 2), "utf-8");
      await fs.rename(tmp, file);
      return {
        accepted: true,
        mode: "pushed",
        detail: `Dropped task ${task.task_id} in OpenClaw queue for ${task.to_agent}`,
        evidence: { path: file },
      };
    } catch (err) {
      return {
        accepted: false,
        mode: "rejected",
        detail: `OpenClaw queue write failed: ${(err as Error).message}`,
        evidence: { path: file },
      };
    }
  },
};
