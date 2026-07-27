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
import { describeMetricEnvelope, type MetricEnvelope } from "@/lib/metric-status";
import type { LivenessObservation } from "@/lib/agent-liveness";
import type { AgentProtocol, AgentStatus, RegisteredAgent } from "@/types";

type ProtocolFilter = "all" | AgentProtocol;
type StatusFilter = "all" | AgentStatus;
type LivenessFilter = "all" | LivenessObservation["state"];

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

function envelopeStatColor(env: MetricEnvelope<number | null>): string {
  const tone = describeMetricEnvelope(env as MetricEnvelope).tone;
  if (tone === "live") return NOC.success;
  if (tone === "zero") return NOC.ink;
  if (tone === "warn") return NOC.warn ?? "#f59e0b";
  if (tone === "alert") return NOC.terra;
  return NOC.soft;
}

function envelopeStatLabel(env: MetricEnvelope<number | null>): string {
  if (env.status === "live" || env.status === "zero") {
    return typeof env.value === "number" ? String(env.value) : "—";
  }
  return describeMetricEnvelope(env as MetricEnvelope).label;
}

export default function AgentRegistryPage() {
  const { data, isLoading, isError, error } = useRegisteredAgents();
  const registerMutation = useRegisterAgentMutation();
  const registerA2aMutation = useRegisterA2aAgentCardMutation();
  const inviteMutation = useCreateAgentOnboardingInviteMutation();
  const deregisterMutation = useDeregisterAgentMutation();
  const [protocol, setProtocol] = useState<ProtocolFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [liveness, setLiveness] = useState<LivenessFilter>("all");
  const [selected, setSelected] = useState<RegisteredAgent | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [inviteCommand, setInviteCommand] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  const agents = useMemo(
    () => (data?.agents ?? []) as (RegisteredAgent & { liveness?: LivenessObservation })[],
    [data?.agents]
  );
  const summary = data?.summary;
  const livenessEnvelope = data?.liveness;
  const protocols = data?.protocols;
  const readiness = data?.readiness;
  const localRuntime = data?.localRuntime;

  const filtered = useMemo(
    () =>
      agents.filter((agent) =>
        (protocol === "all" || agent.protocol === protocol) &&
        (status === "all" || agent.status === status) &&
        (liveness === "all" || agent.liveness?.state === liveness)
      ),
    [agents, protocol, status, liveness]
  );

  const activeCount = agents.filter((agent) => agent.status === "active").length;
  const protocolCount = new Set(agents.map((agent) => agent.protocol)).size;

  const totalEnv = summary?.total;
  const activeEnv = summary?.active;

  const emptyTitle =
    agents.length === 0
      ? "No registered agents yet."
      : "No registered agents match this view.";
  const emptyReason =
    agents.length === 0
      ? "Register an agent above to populate the registry."
      : "Adjust the protocol, status, or liveness filters above to widen the result set.";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agents"
        title="Agents"
        hint="Runtime registry, credentials, capabilities, security modes, and liveness."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <Stat
            label="Registered"
            value={totalEnv ? envelopeStatLabel(totalEnv) : String(agents.length)}
            tone={totalEnv && totalEnv.status === "live" ? "info" : "info"}
          />
          {totalEnv ? (
            <p className="mt-1 text-[10px] text-stone-500" data-registered-source title={totalEnv.reason ?? ""}>
              {totalEnv.value !== null && typeof totalEnv.value === "number" ? `${totalEnv.value}` : "no measurement"} · {totalEnv.status} · source={totalEnv.source}
            </p>
          ) : null}
        </Card>
        <Card>
          <Stat
            label="Active"
            value={activeEnv ? envelopeStatLabel(activeEnv) : String(activeCount)}
            tone={activeEnv && activeEnv.status === "live" ? "success" : "info"}
          />
          {activeEnv ? (
            <p className="mt-1 text-[10px] text-stone-500" data-active-source title={activeEnv.reason ?? ""}>
              {activeEnv.value !== null && typeof activeEnv.value === "number" ? `${activeEnv.value}` : "no measurement"} · {activeEnv.status} · source={activeEnv.source}
            </p>
          ) : null}
        </Card>
        <Card>
          <Stat label="Protocols" value={String(protocolCount)} tone="info" />
          {protocols ? (
            <p className="mt-1 text-[10px] text-stone-500" data-protocols-source>
              rest {protocols.rest.value ?? "—"} ({protocols.rest.status}) · a2a {protocols.a2a.value ?? "—"} ({protocols.a2a.status}) · ui {protocols.ui.value ?? "—"} ({protocols.ui.status}) · local {protocols.local.value ?? "—"} ({protocols.local.status})
            </p>
          ) : null}
        </Card>
      </div>

      {livenessEnvelope ? (
        <div
          className="border border-stone-200 bg-white/90 p-3 text-xs text-stone-700"
          data-testid="agents-liveness-banner"
          data-agents-liveness-banner
          data-liveness-status={livenessEnvelope?.status ?? "unknown"}
        >
          <span className="font-semibold">Liveness:</span>{" "}
          <span style={{ color: envelopeStatColor(livenessEnvelope) }}>
            {describeMetricEnvelope(livenessEnvelope).label}
          </span>{" "}
          {livenessEnvelope?.value !== null && typeof livenessEnvelope?.value === "number"
            ? `(${livenessEnvelope.value} active)`
            : null}
          {livenessEnvelope?.reason ? ` — ${livenessEnvelope.reason}` : ""}
        </div>
      ) : null}

      {readiness ? (
        <div
          className="border border-stone-200 bg-white/90 p-3 text-xs text-stone-700"
          data-agents-readiness-banner
        >
          <span className="font-semibold">Readiness:</span>{" "}
          average {readiness.average.value ?? "—"} ({readiness.average.status}) · with-capabilities{" "}
          {readiness.withCapabilities.value ?? "—"} ({readiness.withCapabilities.status}) · source={readiness.average.source}
        </div>
      ) : null}

      {localRuntime ? (
        <div
          className="border border-stone-200 bg-white/90 p-3 text-xs text-stone-700"
          data-agents-local-runtime-banner
          data-local-runtime-status={localRuntime.metric.status}
        >
          <span className="font-semibold">Local runtime scan:</span>{" "}
          {localRuntime.metric.value !== null ? `${localRuntime.metric.value} active CLI sessions` : "unavailable"}
          {" — "}
          source={localRuntime.metric.source} · status={localRuntime.metric.status}
          {localRuntime.metric.reason ? ` · ${localRuntime.metric.reason}` : ""}
        </div>
      ) : null}

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

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" data-agents-filter-row="protocol">
          <span className="self-center text-xs uppercase tracking-wide text-stone-500">Protocol:</span>
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
              data-filter-value={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" data-agents-filter-row="status">
          <span className="self-center text-xs uppercase tracking-wide text-stone-500">Status:</span>
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
              data-filter-value={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" data-agents-filter-row="liveness">
          <span className="self-center text-xs uppercase tracking-wide text-stone-500">Liveness:</span>
          {(["all", "live", "stale", "never", "missing", "error"] as LivenessFilter[]).map((item) => (
            <button
              key={item}
              className="border px-3 py-1 text-sm font-semibold"
              style={{
                borderColor: liveness === item ? NOC.terra : NOC.rule,
                color: liveness === item ? NOC.terraDeep : NOC.muted,
                background: liveness === item ? NOC.peach : NOC.paper,
              }}
              onClick={() => setLiveness(item)}
              data-filter-value={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : isError ? (
        <div className="border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700" data-agents-error>
          Failed to load /api/agents.
          {error instanceof Error ? ` ${error.message}` : ""}
        </div>
      ) : (
        <AgentRegistryTable
          agents={filtered}
          onSelect={setSelected}
          onDeregister={(agentId) => deregisterMutation.mutate(agentId)}
          onAgentUpdated={(updated) =>
            setSelected((current) =>
              current && current.id === updated.id
                ? { ...current, ...updated }
                : current
            )
          }
          isDeregistering={deregisterMutation.isPending}
          emptyTitle={emptyTitle}
          emptyReason={emptyReason}
        />
      )}

      <AgentRegistryDrawer
        agent={selected}
        liveness={selected ? agents.find((a) => a.id === selected.id)?.liveness ?? null : null}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
