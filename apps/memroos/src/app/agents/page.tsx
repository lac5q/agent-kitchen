"use client";

import { useMemo, useState } from "react";
import {
  useCreateAgentOnboardingInviteMutation,
  useDeregisterAgentMutation,
  useRegisterA2aAgentCardMutation,
  useRegisterAgentMutation,
  useRegisteredAgents,
} from "@/lib/api-client";
import { AgentRegistryDrawer } from "@/components/agents/agent-registry-drawer";
import { AgentRegistrationForm } from "@/components/agents/agent-registration-form";
import { AgentRegistryTable } from "@/components/agents/agent-registry-table";
import { AgentSecurityModesPanel } from "@/components/agents/agent-security-modes-panel";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Stat } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";
import type { AgentProtocol, AgentStatus, RegisteredAgent } from "@/types";

type ProtocolFilter = "all" | AgentProtocol;
type StatusFilter = "all" | AgentStatus;

function inviteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Invite creation failed.";
  if (message.includes("Registry write authorization required")) {
    return "Operator key required. Paste the operator key, then click Copy Invite again.";
  }
  return message;
}

function formatAgentOnboardingPrompt(command: string) {
  return [
    "Run this MemroOS onboarding command exactly as written.",
    "It will register you, infer your agent identity when no name is provided, save your per-agent credentials, and install the MemroOS MCP server for your runtime.",
    "After it finishes, tell me whether it succeeded and include the onboarding report path it printed.",
    "",
    "Command to run:",
    "```bash",
    command,
    "```",
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the selection API below for non-secure origins or denied clipboard access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand?.("copy") ?? false;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function AgentRegistryPage() {
  const { data, isLoading } = useRegisteredAgents();
  const registerMutation = useRegisterAgentMutation();
  const registerA2aMutation = useRegisterA2aAgentCardMutation();
  const inviteMutation = useCreateAgentOnboardingInviteMutation();
  const deregisterMutation = useDeregisterAgentMutation();
  const [protocol, setProtocol] = useState<ProtocolFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<RegisteredAgent | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [inviteCommand, setInviteCommand] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  const agents = useMemo(
    () => (data?.agents ?? []) as RegisteredAgent[],
    [data?.agents]
  );
  const filtered = useMemo(
    () =>
      agents.filter((agent) =>
        (protocol === "all" || agent.protocol === protocol) &&
        (status === "all" || agent.status === status)
      ),
    [agents, protocol, status]
  );

  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const protocolCount = new Set(agents.map((agent) => agent.protocol)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agents"
        title="Agents"
        hint="Runtime registry, credentials, capabilities, security modes, and liveness."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><Stat label="Registered" value={agents.length} /></Card>
        <Card><Stat label="Active" value={activeCount} tone="success" /></Card>
        <Card><Stat label="Protocols" value={protocolCount} tone="info" /></Card>
      </div>

      <AgentSecurityModesPanel />

      <AgentRegistrationForm
        isSubmitting={registerMutation.isPending || registerA2aMutation.isPending}
        onSubmit={(input) =>
          registerMutation.mutate(input, {
            onSuccess: (result) => setOneTimeKey(result.apiKey ?? null),
          })
        }
        onA2aSubmit={(input) =>
          registerA2aMutation.mutate(input, {
            onSuccess: (result) => setOneTimeKey(result.apiKey ?? null),
          })
        }
        onCreateInvite={(input) => {
          setInviteStatus(null);
          setInviteCommand(null);
          inviteMutation.mutate(input, {
            onSuccess: async (result) => {
              if (!result.command) {
                setInviteStatus("Invite response did not include a command. Try again.");
                return;
              }
              const prompt = formatAgentOnboardingPrompt(result.command);
              setInviteCommand(prompt);
              if (await copyTextToClipboard(prompt)) {
                setInviteStatus("Onboarding prompt copied to clipboard.");
              } else {
                setInviteStatus("Invite created. Copy it from the box below.");
              }
            },
            onError: (error) => {
              setInviteCommand(null);
              setInviteStatus(inviteErrorMessage(error));
            },
          });
        }}
        isCreatingInvite={inviteMutation.isPending}
      />

      {oneTimeKey && (
        <Card style={{ background: NOC.warnBg, borderColor: NOC.warnBg }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.warn }}>One-time API key</p>
          <code className="mt-1 block break-all text-sm" style={{ color: NOC.terraDeep }}>{oneTimeKey}</code>
        </Card>
      )}

      {(inviteCommand || inviteStatus) && (
        <div className={`border p-4 ${inviteCommand ? "border-sky-300 bg-white" : "border-rose-500/30 bg-rose-500/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${inviteCommand ? "text-sky-700" : "text-rose-300"}`}>
              {inviteCommand ? "Agent onboarding prompt" : "Invite not created"}
            </p>
            {inviteCommand && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (await copyTextToClipboard(inviteCommand)) {
                    setInviteStatus("Onboarding prompt copied to clipboard.");
                  } else {
                    setInviteStatus("Clipboard unavailable. Copy it from the box below.");
                  }
                }}
              >
                Copy
              </Button>
            )}
          </div>
          {inviteStatus && <p className={`mt-1 text-xs ${inviteCommand ? "text-stone-600" : "text-rose-100"}`}>{inviteStatus}</p>}
          {inviteCommand && (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap border p-3 font-mono text-sm leading-6" style={{ background: NOC.fog, borderColor: NOC.rule, color: NOC.ink }}>
              {inviteCommand}
            </pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["all", "rest", "a2a", "ui", "local"] as ProtocolFilter[]).map((item) => (
          <button
            key={item}
            className="border px-3 py-1 text-sm font-semibold"
            style={{
              borderColor: protocol === item ? NOC.terra : NOC.rule,
              color: protocol === item ? NOC.terraDeep : NOC.muted,
              background: protocol === item ? NOC.peach : NOC.paper,
            }}
            onClick={() => setProtocol(item)}
          >
            {item}
          </button>
        ))}
        {(["all", "active", "idle", "dormant", "error"] as StatusFilter[]).map((item) => (
          <button
            key={item}
            className="border px-3 py-1 text-sm font-semibold"
            style={{
              borderColor: status === item ? NOC.terra : NOC.rule,
              color: status === item ? NOC.terraDeep : NOC.muted,
              background: status === item ? NOC.peach : NOC.paper,
            }}
            onClick={() => setStatus(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <AgentRegistryTable
          agents={filtered}
          onSelect={setSelected}
          onDeregister={(agentId) => deregisterMutation.mutate(agentId)}
          isDeregistering={deregisterMutation.isPending}
        />
      )}

      <AgentRegistryDrawer
        agent={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
