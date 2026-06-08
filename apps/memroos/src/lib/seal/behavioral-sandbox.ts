/**
 * Phase 72-02: Behavioral eval sandbox profile.
 *
 * Provides a no-op tool sandbox for behavioral W-lift evaluation.
 * All side-effecting tools are replaced with stubs that:
 *   - Record the intended call (tool name, inputs, denial reason)
 *   - Return a "denied" result without touching any live external system
 *
 * The sandbox FAILS CLOSED: all tool calls are denied by default.
 * Evidence from recorded calls is exported for the evidence bundle.
 *
 * Per D-08, D-09, D-10:
 * - Side-effecting tools are replaced with no-op recording stubs
 * - Evidence captures tool-call transcript, inputs, denials, and outputs
 * - Live state mutation is prevented — the sandbox must be activated before
 *   any re-execution code runs
 */

import type { RecordedToolCall } from "./behavioral-jobs";

// Re-export for consumers that import from this module
export type { RecordedToolCall };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SandboxToolCallResult {
  /** Always true in sandbox mode — no tool is allowed to execute */
  denied: boolean;
  /** Human-readable reason for the denial */
  denyReason: string;
  /** Recorded output (null in sandbox — no real execution occurs) */
  output: null;
}

export interface SandboxProfile {
  /** Unique identifier for this sandbox session */
  sandboxId: string;
  /**
   * No-op tool stub. Records the call and returns a denied result.
   * Never calls any real implementation or external system.
   */
  callTool(toolName: string, inputs: Record<string, unknown>): Promise<SandboxToolCallResult>;
  /** All tool calls recorded so far in this sandbox session */
  recordedCalls: RecordedToolCall[];
  /**
   * Returns a snapshot of all recorded calls suitable for evidence bundle inclusion.
   * The returned array is a copy — mutations to the original are not reflected.
   */
  exportTranscript(): RecordedToolCall[];
}

// ---------------------------------------------------------------------------
// Sandbox factory
// ---------------------------------------------------------------------------

export interface CreateSandboxOptions {
  /** Unique identifier for the sandbox session (e.g., eval job id) */
  sandboxId: string;
  /**
   * Optional custom deny reason prefix.
   * Defaults to "sandbox: tool call denied — behavioral eval runs in no-op mode".
   */
  denyReasonPrefix?: string;
}

/**
 * Creates a behavioral eval sandbox profile.
 *
 * The sandbox profile's `callTool` method is a safe no-op stub that:
 * 1. Records the call with its inputs to `recordedCalls`
 * 2. Returns a `denied: true` result with a descriptive reason
 * 3. Never invokes any real tool implementation
 *
 * Usage:
 * ```ts
 * const profile = createSandboxProfile({ sandboxId: jobId });
 * const result = await profile.callTool("web_search", { query: "..." });
 * // result.denied === true, result.output === null
 * const transcript = profile.exportTranscript();
 * ```
 */
export function createSandboxProfile(options: CreateSandboxOptions): SandboxProfile {
  const { sandboxId, denyReasonPrefix } = options;
  const defaultDenyReason = denyReasonPrefix ??
    "sandbox: tool call denied — behavioral eval runs in no-op mode";

  const recordedCalls: RecordedToolCall[] = [];

  const callTool = async (
    toolName: string,
    inputs: Record<string, unknown>
  ): Promise<SandboxToolCallResult> => {
    const denyReason = `${defaultDenyReason} (tool: ${toolName})`;

    const recorded: RecordedToolCall = {
      toolName,
      inputs,
      denied: true,
      denyReason,
      output: undefined,
    };
    recordedCalls.push(recorded);

    return {
      denied: true,
      denyReason,
      output: null,
    };
  };

  const exportTranscript = (): RecordedToolCall[] => {
    return recordedCalls.map((call) => ({ ...call }));
  };

  return {
    sandboxId,
    callTool,
    recordedCalls,
    exportTranscript,
  };
}
