"use client";

import { useSecurityCapabilities } from "@/lib/api-client";
import { describeMetricEnvelope } from "@/lib/metric-status";

function modeClass(mode: string): string {
  if (mode === "strict") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (mode === "permissive") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

function envelopeColor(env: ReturnType<typeof describeMetricEnvelope>): string {
  if (env.tone === "live") return "text-emerald-300";
  if (env.tone === "zero") return "text-stone-700";
  if (env.tone === "warn") return "text-amber-300";
  if (env.tone === "alert") return "text-rose-300";
  return "text-sky-300";
}

function envelopeText(env: ReturnType<typeof describeMetricEnvelope>): string {
  if (env.tone === "live") return env.label;
  return env.label;
}

export function AgentSecurityModesPanel() {
  const { data, isLoading, isError, error } = useSecurityCapabilities();
  const agents = data?.agents ?? [];
  const summaryOk = !isLoading && !isError && data !== undefined;
  const metrics = data?.summary.metrics;
  const totalMetric = metrics?.totalAgents;
  const strictMetric = metrics?.strictAgents;
  const capsMetric = metrics?.agentsWithSecurityCapabilities;

  return (
    <div className="border border-stone-200 bg-white/90 p-4" data-agents-security-modes>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Security Modes
        </span>
        <div className="h-px flex-1 bg-amber-900/40" />
        {data?.policies.defaultMode && (
          <span className="text-xs text-stone-500" data-policies-default>
            default {data.policies.defaultMode}
          </span>
        )}
      </div>

      {isError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700">
          Failed to load /api/security/capabilities.
          {" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(18rem,1.3fr)]">
          <div className="grid grid-cols-2 gap-3">
            <div
              className="border border-stone-200 bg-white p-3"
              data-summary-card="strict-agents"
              data-metric-status={strictMetric?.status ?? "unknown"}
            >
              <p className="text-xs text-stone-500">Strict Agents</p>
              <p className={`mt-1 text-2xl font-semibold ${envelopeColor(describeMetricEnvelope(strictMetric ?? { status: "empty", value: null, source: "", observedAt: null, freshnessMs: null, scope: { window: "lifetime", workspace: "all" }, reason: null }))}`}>
                {summaryOk && strictMetric ? envelopeText(describeMetricEnvelope(strictMetric)) : "—"}
              </p>
              {summaryOk && strictMetric ? (
                <p className="mt-1 text-[10px] text-stone-500" title={strictMetric.reason ?? ""}>
                  {strictMetric.value !== null ? `${strictMetric.value}` : "no measurement"} · {strictMetric.status}
                </p>
              ) : null}
            </div>
            <div
              className="border border-stone-200 bg-white p-3"
              data-summary-card="security-caps"
              data-metric-status={capsMetric?.status ?? "unknown"}
            >
              <p className="text-xs text-stone-500">Security Caps</p>
              <p className={`mt-1 text-2xl font-semibold ${envelopeColor(describeMetricEnvelope(capsMetric ?? { status: "empty", value: null, source: "", observedAt: null, freshnessMs: null, scope: { window: "lifetime", workspace: "all" }, reason: null }))}`}>
                {summaryOk && capsMetric ? envelopeText(describeMetricEnvelope(capsMetric)) : "—"}
              </p>
              {summaryOk && capsMetric ? (
                <p className="mt-1 text-[10px] text-stone-500" title={capsMetric.reason ?? ""}>
                  {capsMetric.value !== null ? `${capsMetric.value}` : "no measurement"} · {capsMetric.status}
                </p>
              ) : null}
            </div>
            <div className="col-span-2 border border-stone-200 bg-white p-3" data-policies-summary>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Policies</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  dispatch {data?.policies.dispatchPolicy ?? "unknown"}
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  a2a {data?.policies.a2aPolicy ?? "unknown"}
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  memory {data?.policies.memoryWritePolicy ?? "unknown"}
                </span>
              </div>
              {data?.policies.metric ? (
                <p
                  className="mt-2 text-[10px] text-stone-500"
                  data-policies-source
                  title={data.policies.metric.reason ?? ""}
                >
                  source: {data.policies.metric.source} · {data.policies.metric.status}
                </p>
              ) : null}
            </div>
            {totalMetric ? (
              <div className="col-span-2 text-[11px] text-stone-500" data-summary-source>
                source: {totalMetric.source} · observed at {totalMetric.observedAt ?? "—"} · status: {totalMetric.status}
                {totalMetric.reason ? ` · ${totalMetric.reason}` : ""}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden border border-stone-200 bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-stone-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500">
              <span>Agent</span>
              <span>Mode</span>
              <span>Ready</span>
            </div>
            <div className="max-h-64 overflow-auto">
              {agents.length === 0 ? (
                <p className="p-5 text-center text-sm text-stone-500" data-empty-agents>
                  No registered agents yet.
                </p>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-stone-200 px-3 py-2 last:border-0"
                    data-agent-id={agent.id}
                    data-agent-liveness={agent.liveness?.state ?? "unknown"}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-700">{agent.name}</p>
                      <p className="truncate text-xs text-stone-500">
                        {agent.role} - {agent.protocol} · {agent.liveness?.state ?? "unknown"}
                      </p>
                    </div>
                    <span className={`self-center rounded border px-2 py-0.5 text-xs ${modeClass(agent.securityMode)}`}>
                      {agent.securityMode}
                    </span>
                    <span className="self-center tabular-nums text-sm text-stone-600">{agent.readinessScore}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
