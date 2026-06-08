"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Mic,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
  Send,
  TestTube2,
  Video,
  Volume2,
} from "lucide-react";
import { useAgents, useDelegations } from "@/lib/api-client";
import { PLATFORM_LABELS } from "@/lib/constants";
import { InfoTip } from "@/components/ui/info-tip";
import { LineageDrawer } from "@/components/dispatch/lineage-drawer";
import type { RegisteredAgent } from "@/types";

type Mode = "chat" | "room";
type ChatMessage = { role: "user" | "assistant" | "system"; content: string; agentId?: string };
type AgentGroup = "primary" | "directory";
type AgentCheck = {
  agentId: string;
  name: string;
  status: RegisteredAgent["status"];
  chat: {
    status: "ready" | "blocked" | "warning";
    runner: string;
    model?: string;
    source?: string;
    fallbackRunner?: string | null;
    fallbackModel?: string | null;
    detail: string;
    lastError?: string;
  };
  dispatch: { status: "ready" | "blocked" | "warning"; adapter: string; detail: string };
  voice: { status: "ready" | "blocked" | "warning"; detail: string };
};

const MODE_COPY: Record<Mode, { label: string; description: string }> = {
  chat: {
    label: "Direct Chat",
    description: "Talk to one selected agent with typed or spoken input.",
  },
  room: {
    label: "Group Room",
    description: "Run one shared standup or conference prompt across every selected room participant.",
  },
};

const DEFAULT_ROOM_PROMPT =
  "Start a concise group conference round. Each participant should share current state, what changed since yesterday, what they plan to do today, and what they need next.";

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  idle: "border-sky-200 bg-sky-50 text-sky-700",
  dormant: "border-slate-200 bg-slate-50 text-stone-500",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_ORDER: Record<RegisteredAgent["status"], number> = {
  active: 0,
  idle: 1,
  dormant: 2,
  error: 3,
};

const COMMON_AGENT_IDS = [
  "alba",
  "sophia",
  "maria",
  "lucia",
  "gwen",
  "claude-sonnet-engineer",
  "codex-cli-agent",
  "gemini-senior-engineer",
  "qwen-engineer",
];

const DEFAULT_MODEL_BY_PLATFORM: Partial<Record<RegisteredAgent["platform"], string>> = {
  claude: "claude-sonnet-4-6",
  codex: "claude-haiku-4-5",
  chatgpt: "claude-haiku-4-5",
  hermes: "claude-haiku-4-5",
  openclaw: "claude-haiku-4-5",
  gemini: "google/gemini-2.0-pro-exp",
  qwen: "bailian/qwen3.5-plus",
  opencode: "bailian/qwen3.5-plus",
};

function formatAgent(agent: RegisteredAgent): string {
  const platform = PLATFORM_LABELS[agent.platform] ?? agent.platform;
  return `${platform} - ${agent.name}`;
}

function metadataSource(agent: RegisteredAgent): string {
  const source = agent.metadata?.source;
  return typeof source === "string" ? source : "";
}

function metadataText(agent: RegisteredAgent): string {
  try {
    return JSON.stringify(agent.metadata ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function isPaperclipAgent(agent: RegisteredAgent): boolean {
  const haystack = `${agent.id} ${agent.name} ${agent.role} ${metadataSource(agent)} ${metadataText(agent)}`.toLowerCase();
  return (
    haystack.includes("paperclip") ||
    haystack.includes("pmo-agent") ||
    haystack.includes("pmo_agents") ||
    haystack.includes("pmo agents")
  );
}

function isPrimaryAgent(agent: RegisteredAgent): boolean {
  return agent.status === "active" || COMMON_AGENT_IDS.includes(agent.id);
}

function agentGroup(agent: RegisteredAgent): AgentGroup {
  if (isPrimaryAgent(agent)) return "primary";
  return "directory";
}

function defaultModelLabel(agent: RegisteredAgent): string {
  return DEFAULT_MODEL_BY_PLATFORM[agent.platform] ?? "registered default";
}

function chatModelLabel(agent: RegisteredAgent, check?: AgentCheck): string {
  if (check?.chat.model) return `${check.chat.runner} / ${check.chat.model}`;
  return defaultModelLabel(agent);
}

function chatStatusLine(check?: AgentCheck): string {
  if (!check) return "Not tested";
  const fallback = check.chat.fallbackRunner && check.chat.fallbackModel
    ? ` -> ${check.chat.fallbackRunner}/${check.chat.fallbackModel}`
    : "";
  return `${check.dispatch.adapter} / ${check.chat.runner}${fallback}`;
}

function sortAgents(a: RegisteredAgent, b: RegisteredAgent): number {
  const commonDelta = COMMON_AGENT_IDS.indexOf(a.id) - COMMON_AGENT_IDS.indexOf(b.id);
  if (COMMON_AGENT_IDS.includes(a.id) || COMMON_AGENT_IDS.includes(b.id)) {
    if (!COMMON_AGENT_IDS.includes(a.id)) return 1;
    if (!COMMON_AGENT_IDS.includes(b.id)) return -1;
    return commonDelta;
  }
  const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  return statusDelta || a.name.localeCompare(b.name);
}

function parseChatError(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string };
        message?: string;
      };
      return parsed.error?.message ?? parsed.message ?? raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function readChatStream(
  response: Response,
  onText: (text: string) => void
): Promise<string> {
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(parseChatError(detail || `HTTP ${response.status}`));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let error: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") break;
      try {
        const parsed = JSON.parse(payload) as { text?: string; error?: string };
        if (parsed.error) {
          error = parseChatError(parsed.error);
          break;
        }
        if (parsed.text) {
          full += parsed.text;
          onText(full);
        }
      } catch {
        // Ignore malformed stream events.
      }
    }
    if (error) break;
  }

  if (error) throw new Error(error);
  return full;
}

function Pill({ value }: { value: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[value] ?? STATUS_STYLES.dormant}`}>
      {value}
    </span>
  );
}

export function AgentEngagementConsole() {
  const { data: agentsData, isLoading: agentsLoading } = useAgents();
  const { data: delegationsData } = useDelegations(8);
  const agents = useMemo(() => (agentsData?.agents ?? []) as RegisteredAgent[], [agentsData?.agents]);

  const [mode, setMode] = useState<Mode>("chat");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[] | null>(null);
  const [showSupportAgents, setShowSupportAgents] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RegisteredAgent["status"] | "all">("all");
  const [message, setMessage] = useState("");
  const [standupFocus, setStandupFocus] = useState("");
  const [standupBlockers, setStandupBlockers] = useState("");
  const [standupAsk, setStandupAsk] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [checks, setChecks] = useState<Record<string, AgentCheck>>({});
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const supportAgents = useMemo(() => agents.filter(isPaperclipAgent), [agents]);
  const rosterAgents = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return agents
      .filter((agent) => showSupportAgents || !isPaperclipAgent(agent))
      .filter((agent) => statusFilter === "all" || agent.status === statusFilter)
      .filter((agent) => {
        if (!query) return true;
        return `${agent.id} ${agent.name} ${agent.role} ${agent.platform} ${metadataSource(agent)}`.toLowerCase().includes(query);
      });
  }, [agents, rosterQuery, showSupportAgents, statusFilter]);
  const primaryAgents = useMemo(() => rosterAgents.filter((agent) => agentGroup(agent) === "primary" && !isPaperclipAgent(agent)).sort(sortAgents), [rosterAgents]);
  const directoryAgents = useMemo(() => rosterAgents.filter((agent) => agentGroup(agent) === "directory" && !isPaperclipAgent(agent)).sort(sortAgents), [rosterAgents]);
  const supportRosterAgents = useMemo(() => rosterAgents.filter(isPaperclipAgent).sort(sortAgents), [rosterAgents]);
  const activeAgents = useMemo(() => primaryAgents.filter((agent) => agent.status === "active"), [primaryAgents]);
  const roster = useMemo(
    () => [...primaryAgents, ...directoryAgents, ...supportRosterAgents],
    [directoryAgents, primaryAgents, supportRosterAgents]
  );
  const defaultRoomIds = activeAgents.length > 0 ? activeAgents.map((agent) => agent.id) : roster.map((agent) => agent.id);
  const defaultAgentId = activeAgents[0]?.id ?? roster[0]?.id ?? "";

  const selectedAgent = useMemo(
    () => roster.find((agent) => agent.id === (selectedAgentId || defaultAgentId)) ?? roster[0],
    [defaultAgentId, roster, selectedAgentId]
  );
  const selectedId = selectedAgent?.id ?? "";
  const selectedLabel = selectedAgent ? formatAgent(selectedAgent) : "No agent selected";
  const roomParticipantIds = participants ?? defaultRoomIds;
  const roomParticipantLabel = `${roomParticipantIds.length} agent${roomParticipantIds.length === 1 ? "" : "s"}`;
  const recentDelegations = delegationsData?.delegations ?? [];
  const visibleHistory = mode === "chat"
    ? history.filter((entry) => entry.agentId === selectedId && entry.role !== "system")
    : history;

  function toggleParticipant(agentId: string) {
    setParticipants((current) =>
      (current ?? defaultRoomIds).includes(agentId)
        ? (current ?? defaultRoomIds).filter((id) => id !== agentId)
        : [...(current ?? defaultRoomIds), agentId]
    );
  }

  function agentName(agentId?: string): string {
    if (!agentId) return "Agent";
    return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
  }

  function formatMeetingTranscript(entries: ChatMessage[]): string {
    return entries
      .map((entry) => {
        const speaker = entry.role === "user"
          ? "Luis"
          : entry.role === "assistant"
            ? agentName(entry.agentId)
            : "System";
        return `${speaker}: ${entry.content}`;
      })
      .join("\n\n");
  }

  async function speak(text: string, agentId = selectedId) {
    if (!agentId || !text.trim()) return;
    audioRef.current?.pause();
    setSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, text }),
      });
      if (!res.ok) throw new Error("TTS unavailable");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }

  async function sendChatMessage(text = message, withVoice = false) {
    if (!selectedId || !text.trim() || busy) return;
    setBusy(true);
    setMessage("");
    const userMsg: ChatMessage = { role: "user", content: text, agentId: selectedId };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", agentId: selectedId };
    setHistory((current) => [...current, userMsg, assistantMsg]);

    try {
      let finalText = "";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          agentId: selectedId,
          history: visibleHistory
            .filter((entry) => entry.role !== "system")
            .slice(-10)
            .map((entry) => ({ role: entry.role, content: entry.content })),
        }),
      });
      finalText = await readChatStream(res, (nextText) => {
        setHistory((current) => {
          const updated = [...current];
          updated[updated.length - 1] = { role: "assistant", content: nextText, agentId: selectedId };
          return updated;
        });
      });
      if (withVoice && finalText) await speak(finalText);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Chat failed";
      setHistory((current) => {
        const updated = [...current];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Chat unavailable: ${detail}`,
          agentId: selectedId,
        };
        return updated;
      });
    } finally {
      setBusy(false);
    }
  }

  async function runMeetingRound(
    text: string,
    options: { label?: string; withVoice?: boolean } = {}
  ) {
    const prompt = text.trim();
    if (!prompt || roomParticipantIds.length === 0 || busy) return;

    setBusy(true);
    setMessage("");
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const roomMsg: ChatMessage = {
      role: "system",
      content: `${options.label ?? "Room session"} started with ${roomParticipantIds.map((id) => agentName(id)).join(", ")}.`,
    };
    let meetingHistory: ChatMessage[] = [...history.slice(-12), userMsg];
    setHistory((current) => [...current, roomMsg, userMsg]);

    try {
      for (const agentId of roomParticipantIds) {
        setActiveSpeakerId(agentId);
        const participantNames = roomParticipantIds.map((id) => agentName(id)).join(", ");
        const turnPrompt = [
          `You are in a live agent standup meeting with Luis and these participants: ${participantNames}.`,
          `Meeting transcript so far:\n${formatMeetingTranscript(meetingHistory)}`,
          `It is your turn as ${agentName(agentId)}. Respond conversationally and concisely. Add your status, blocker, or next step when relevant, then stop so the next agent can take a turn.`,
        ].join("\n\n");

        setHistory((current) => [...current, { role: "assistant", content: "", agentId }]);

        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: turnPrompt,
              agentId,
              history: [],
            }),
          });
          const finalText = await readChatStream(res, (nextText) => {
            setHistory((current) => {
              const updated = [...current];
              const targetIndex = updated.findLastIndex(
                (entry) => entry.role === "assistant" && entry.agentId === agentId
              );
              if (targetIndex >= 0) {
                updated[targetIndex] = { role: "assistant", content: nextText, agentId };
              }
              return updated;
            });
          });
          if (options.withVoice && finalText) await speak(finalText, agentId);
          meetingHistory = [...meetingHistory, { role: "assistant", content: finalText, agentId }];
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Chat failed";
          const failure = `Chat unavailable: ${detail}`;
          setHistory((current) => {
            const updated = [...current];
            const targetIndex = updated.findLastIndex(
              (entry) => entry.role === "assistant" && entry.agentId === agentId
            );
            if (targetIndex >= 0) {
              updated[targetIndex] = { role: "assistant", content: failure, agentId };
            }
            return updated;
          });
          meetingHistory = [...meetingHistory, { role: "assistant", content: failure, agentId }];
        }
      }
    } finally {
      setActiveSpeakerId(null);
      setBusy(false);
    }
  }

  async function runStandup() {
    const prompt = [
      "Run a 15-minute standup for the room.",
      "Each participant should answer in a concise, operator-readable format:",
      "1. Yesterday: what happened since the last checkpoint?",
      "2. Today: what will you do next?",
      "3. Blockers: what is blocked, stale, or missing?",
      "4. Next 15 minutes: what concrete move can happen now?",
      standupFocus ? `Focus: ${standupFocus}` : "Focus: make the dispatch room reliable and easy to operate.",
      standupBlockers ? `Known blockers: ${standupBlockers}` : null,
      standupAsk ? `Operator ask: ${standupAsk}` : "Operator ask: be brief, specific, and name the next action.",
    ].filter(Boolean).join("\n");
    await runMeetingRound(prompt, { label: "15-minute standup" });
  }

  async function runConferencePrompt(text = message) {
    await runMeetingRound(text.trim() ? text : DEFAULT_ROOM_PROMPT, { label: "Conference round" });
  }

  async function runAgentTests(ids = roster.map((agent) => agent.id)) {
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch("/api/engagement/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds: ids }),
      });
      const body = (await res.json()) as { results?: AgentCheck[] };
      const next = Object.fromEntries((body.results ?? []).map((check) => [check.agentId, check]));
      setChecks((current) => ({ ...current, ...next }));
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Agent test failed — network error");
    } finally {
      setTesting(false);
    }
  }

  function renderAgentCard(agent: RegisteredAgent) {
    const selected = selectedId === agent.id;
    const participating = roomParticipantIds.includes(agent.id);
    const check = checks[agent.id];
    return (
      <article
        key={agent.id}
        className={`rounded-md border p-3 transition ${
          selected
            ? "border-cyan-300 bg-cyan-50 shadow-[0_10px_30px_rgba(8,145,178,0.10)]"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedAgentId(agent.id);
          }}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-950">{agent.name}</span>
            <span className="mt-0.5 block truncate text-xs text-stone-500">{PLATFORM_LABELS[agent.platform] ?? agent.platform} - {agent.role}</span>
            <span className="mt-1 block truncate text-[11px] text-stone-500">model: {chatModelLabel(agent, check)}</span>
          </span>
          <Pill value={agent.status} />
        </button>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-stone-500">
            {chatStatusLine(check)}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void runAgentTests([agent.id]);
              }}
              disabled={testing}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-stone-600 disabled:opacity-50"
            >
              Test
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleParticipant(agent.id);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-stone-600"
            >
              {participating ? <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" /> : <Circle className="h-3.5 w-3.5" />}
              Room
            </button>
          </div>
        </div>
      </article>
    );
  }

  function startVoiceCapture() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setHistory((current) => [
        ...current,
        {
          role: "system",
          content: "Voice capture is not supported in this browser. Type the prompt, then use Start conference round or Run 15-minute standup.",
        },
      ]);
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setListening(false);
      if (!transcript) return;
      if (mode === "room") {
        void runMeetingRound(transcript, { label: "Spoken room prompt", withVoice: true });
      } else {
        void sendChatMessage(transcript, true);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Agent Engagement</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
              Direct agent chat plus one room for 15-minute standups, spoken prompts, and conference rounds.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runAgentTests(primaryAgents.map((agent) => agent.id))}
            disabled={testing || roster.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-50"
          >
            {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            Test primary agents
          </button>
        </div>
        {testError ? (
          <p className="mt-2 text-sm font-medium text-red-600">{testError}</p>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_16px_48px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center text-sm font-semibold text-slate-950">
              Agent roster
              <InfoTip text="Primary working agents are shown first. Paperclip and PMO support agents are hidden by default and belong in the workflow map unless you explicitly show system agents." />
            </h2>
            <Pill value={`${activeAgents.length} active / ${roster.length} registered`} />
          </div>
          <div className="mb-3 space-y-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-stone-600">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
              <input
                type="search"
                value={rosterQuery}
                onChange={(event) => setRosterQuery(event.target.value)}
                placeholder="Filter agents..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
                aria-label="Filter agents"
              />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as RegisteredAgent["status"] | "all")}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-stone-600 outline-none"
                aria-label="Filter by agent status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="idle">Idle</option>
                <option value="dormant">Dormant</option>
                <option value="error">Error</option>
              </select>
              <button
                type="button"
                onClick={() => setShowSupportAgents((value) => !value)}
                className={`h-8 rounded-md border px-2 text-xs font-semibold transition ${
                  showSupportAgents
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-stone-600 hover:bg-slate-50"
                }`}
              >
                {showSupportAgents ? "Hide system" : `Show system (${supportAgents.length})`}
              </button>
            </div>
          </div>
          {agentsLoading && <p className="text-sm text-stone-500">Loading agents...</p>}
          <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
            {primaryAgents.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Primary agents</p>
                {primaryAgents.map(renderAgentCard)}
              </div>
            )}
            {directoryAgents.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">Registered directory</p>
                {directoryAgents.map(renderAgentCard)}
              </div>
            )}
            {showSupportAgents && supportRosterAgents.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">System / Paperclip</p>
                {supportRosterAgents.map(renderAgentCard)}
              </div>
            )}
            {!agentsLoading && roster.length === 0 && (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-stone-500">
                No agents match the current filters.
              </p>
            )}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center text-base font-semibold text-slate-950">
                  Engagement Controls
                  <InfoTip text="Use Direct Chat for one agent, or Group Room to ask selected participants for a standup or conference round." />
                </h2>
                <p className="mt-1 text-sm text-stone-500">{selectedLabel}</p>
              </div>
              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
                {(Object.keys(MODE_COPY) as Mode[]).map((nextMode) => (
                  <button
                    key={nextMode}
                    type="button"
                    onClick={() => setMode(nextMode)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                      mode === nextMode ? "bg-white text-slate-950 shadow-sm" : "text-stone-500 hover:text-slate-900"
                    }`}
                    title={MODE_COPY[nextMode].description}
                  >
                    {MODE_COPY[nextMode].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-0 2xl:grid-cols-[1fr_280px]">
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center text-sm font-semibold text-slate-950">
                  {MODE_COPY[mode].label}
                  <InfoTip text={MODE_COPY[mode].description} />
                </p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{MODE_COPY[mode].description}</p>
              </div>

              {mode === "room" && (
                <section className="rounded-md border border-cyan-200 bg-cyan-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-cyan-950">Room session</p>
                      <p className="mt-1 text-xs leading-5 text-cyan-800">
                        {roomParticipantIds.length > 0
                          ? `Ready to ask ${roomParticipantLabel} what happened yesterday, what should happen today, and what is blocked.`
                          : "Select at least one Room participant on the left."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setParticipants(defaultRoomIds)}
                        disabled={busy || defaultRoomIds.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-40"
                      >
                        Use active
                      </button>
                      <button
                        type="button"
                        onClick={() => setParticipants(roster.map((agent) => agent.id))}
                        disabled={busy || roster.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-40"
                      >
                        Use all
                      </button>
                      <button
                        type="button"
                        onClick={runStandup}
                        disabled={busy || roomParticipantIds.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-950 px-4 py-2 text-sm font-semibold text-stone-50 transition hover:bg-cyan-900 disabled:opacity-40"
                      >
                        <MessageSquare className="h-4 w-4" />
                        {busy ? "Running..." : `Run 15-minute standup with ${roomParticipantLabel}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => runConferencePrompt()}
                        disabled={busy || roomParticipantIds.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-300 bg-white px-4 py-2 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-40"
                      >
                        <PhoneCall className="h-4 w-4" />
                        Start conference round
                      </button>
                      <button
                        type="button"
                        onClick={startVoiceCapture}
                        disabled={busy || roomParticipantIds.length === 0}
                        className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                          listening
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-cyan-300 bg-white text-cyan-900 hover:bg-cyan-100"
                        }`}
                      >
                        <Mic className="h-4 w-4" />
                        {listening ? "Listening..." : "Speak to room"}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {mode === "room" && (
                <div className="rounded-md border border-slate-200 bg-white p-3 text-stone-950">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-cyan-300" />
                      <p className="text-sm font-semibold">Live room</p>
                    </div>
                    <span className="text-xs text-stone-600">
                      {busy && activeSpeakerId ? `${agentName(activeSpeakerId)} speaking` : `${roomParticipantIds.length} seats`}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {roomParticipantIds.map((agentId) => {
                      const agent = agents.find((item) => item.id === agentId);
                      const speakingNow = activeSpeakerId === agentId;
                      const initials = (agent?.name ?? agentId)
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase();
                      return (
                        <div
                          key={agentId}
                          className={`min-h-28 rounded-md border p-3 transition ${
                            speakingNow
                              ? "border-cyan-300 bg-cyan-500/15 shadow-[0_0_0_1px_rgba(103,232,249,0.45)]"
                              : "border-stone-300 bg-white"
                          }`}
                        >
                          <div className="flex h-full flex-col justify-between">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-100 text-sm font-semibold text-cyan-900">
                                {initials}
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                                speakingNow ? "bg-cyan-300 text-slate-950" : "bg-stone-100 text-stone-600"
                              }`}>
                                <Mic className="h-3 w-3" />
                                {speakingNow ? "Live" : "Ready"}
                              </span>
                            </div>
                            <div>
                              <p className="truncate text-sm font-semibold">{agent?.name ?? agentId}</p>
                              <p className="truncate text-xs text-stone-500">{PLATFORM_LABELS[agent?.platform ?? ""] ?? agent?.platform ?? agentId}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="min-h-56 max-h-80 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-3">
                {visibleHistory.length === 0 ? (
                  <p className="py-14 text-center text-sm text-stone-500">
                    {mode === "room"
                      ? "Run the 15-minute standup or start a conference round to let each selected agent take a turn."
                      : "Send a direct prompt or speak to the selected agent."}
                  </p>
                ) : (
                  visibleHistory.slice(-10).map((entry, index) => (
                    <div
                      key={`${entry.role}-${index}`}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        entry.role === "user"
                          ? "ml-8 border-cyan-100 bg-cyan-50 text-cyan-950"
                          : entry.role === "assistant"
                            ? "mr-8 border-slate-200 bg-slate-50 text-slate-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                        {entry.role === "user" ? "You" : entry.role === "assistant" ? agentName(entry.agentId) : "System"}
                      </p>
                      <p className="whitespace-pre-wrap leading-6">{entry.content || "..."}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                {mode === "room" && (
                  <div className="grid gap-3">
                    <label className="text-sm font-semibold text-slate-700">
                      Standup focus <InfoTip text="What each selected agent should report progress against." />
                      <input
                        aria-label="Standup focus"
                        value={standupFocus}
                        onChange={(event) => setStandupFocus(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-cyan-400"
                        placeholder="What changed yesterday and what should happen today?"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Blockers <InfoTip text="Ask agents to surface missing context, permissions, or runtime failures." />
                        <input
                          value={standupBlockers}
                          onChange={(event) => setStandupBlockers(event.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-cyan-400"
                          placeholder="Anything blocked or stale?"
                        />
                      </label>
                      <label className="text-sm font-semibold text-slate-700">
                        Ask <InfoTip text="The exact response or action expected from each participant." />
                        <input
                          value={standupAsk}
                          onChange={(event) => setStandupAsk(event.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-cyan-400"
                          placeholder="Reply with status, next step, and one risk."
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <textarea
                    suppressHydrationWarning
                    aria-label={mode === "room" ? "Room prompt" : "Direct message"}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && mode === "chat") {
                        event.preventDefault();
                        void sendChatMessage(message);
                      }
                    }}
                    rows={2}
                    placeholder={mode === "room" ? "Ask the room something, or leave blank and start the default conference round..." : `Message ${selectedAgent?.name ?? "agent"}...`}
                    className="min-h-16 flex-1 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-stone-500 focus:border-cyan-400"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => (mode === "room" ? runConferencePrompt() : sendChatMessage(message))}
                      disabled={busy || (mode === "chat" ? !message.trim() || !selectedId : roomParticipantIds.length === 0)}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-stone-950 transition hover:bg-stone-100 disabled:opacity-40"
                      aria-label={mode === "room" ? "Send room prompt" : "Send message"}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={startVoiceCapture}
                      disabled={busy || (mode === "room" && roomParticipantIds.length === 0)}
                      className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold transition ${
                        listening
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
                      }`}
                      aria-label={mode === "room" ? "Record room prompt" : "Speak to agent"}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="border-t border-slate-200 p-4 2xl:border-l 2xl:border-t-0">
              <div className="space-y-4">
                <div>
                  <h3 className="flex items-center text-sm font-semibold text-slate-950">
                    Room
                    <InfoTip text="Selected agents receive standup and conference prompts. Direct Chat uses the primary selected agent." />
                  </h3>
                  <p className="mt-1 text-xs text-stone-500">{roomParticipantIds.length} participant{roomParticipantIds.length === 1 ? "" : "s"}</p>
                </div>
                <div className="space-y-2">
                  {roomParticipantIds.map((agentId) => {
                    const agent = agents.find((item) => item.id === agentId);
                    return (
                      <div key={agentId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{agent?.name ?? agentId}</p>
                        <p className="truncate text-xs text-stone-500">{agentId}</p>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <h3 className="flex items-center text-sm font-semibold text-slate-950">
                    Diagnostics
                    <InfoTip text="Tests chat configuration, dispatch delivery mode, and server-side TTS prerequisites for selected agents." />
                  </h3>
                  <div className="mt-2 space-y-2">
                    {roomParticipantIds.map((agentId) => {
                      const check = checks[agentId];
                      return (
                        <div key={agentId} className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                          <p className="mb-2 font-semibold text-slate-900">{agents.find((agent) => agent.id === agentId)?.name ?? agentId}</p>
                          {check ? (
                            <div className="space-y-1.5">
                              <p><Pill value={check.chat.status} /> <span className="ml-1 text-stone-500">chat: {check.chat.detail}</span></p>
                              <p className="text-stone-500">model: {check.chat.runner}/{check.chat.model ?? "unknown"}{check.chat.source ? ` via ${check.chat.source}` : ""}</p>
                              {check.chat.fallbackRunner && check.chat.fallbackModel ? (
                                <p className="text-stone-500">fallback: {check.chat.fallbackRunner}/{check.chat.fallbackModel}</p>
                              ) : null}
                              <p><Pill value={check.dispatch.status} /> <span className="ml-1 text-stone-500">dispatch: {check.dispatch.detail}</span></p>
                              <p><Pill value={check.voice.status} /> <span className="ml-1 text-stone-500">voice: {check.voice.detail}</span></p>
                            </div>
                          ) : (
                            <p className="text-stone-500">Run tests to verify this agent.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="flex items-center text-sm font-semibold text-slate-950">
                    Recent Delegations
                    <InfoTip text="The latest queued or pushed engagements created by dispatch." />
                  </h3>
                  <div className="mt-2 space-y-2">
                    {recentDelegations.slice(0, 4).map((delegation) => (
                      <div key={delegation.task_id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="truncate text-xs font-semibold text-slate-800">{delegation.task_summary}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Pill value={delegation.status} />
                          <LineageDrawer taskId={delegation.task_id} taskSummary={delegation.task_summary} />
                        </div>
                      </div>
                    ))}
                    {recentDelegations.length === 0 && <p className="text-xs text-stone-500">No delegations yet.</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <PhoneCall className="h-4 w-4 text-stone-500" />
                    <p className="mt-2 text-xs font-semibold text-slate-900">Group room</p>
                    <p className="text-[11px] leading-4 text-stone-500">Standup and conference turns.</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <Volume2 className="h-4 w-4 text-stone-500" />
                    <p className="mt-2 text-xs font-semibold text-slate-900">Speak</p>
                    <p className="text-[11px] leading-4 text-stone-500">{speaking ? "Speaking now" : "Mic plus TTS"}</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
