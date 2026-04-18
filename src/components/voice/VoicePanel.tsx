"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useVoiceStatus } from "@/lib/api-client";
import { useVoiceTranscript } from "./useVoiceTranscript";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

interface Agent {
  id: string;
  label: string;
}

const AGENTS: Agent[] = [
  { id: "kitchen", label: "Kitchen Floor" },
  { id: "flow",    label: "Flow" },
  { id: "general", label: "General" },
];

type VoiceConnState = "disconnected" | "connecting" | "connected" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoicePanel() {
  const { data: voiceStatus } = useVoiceStatus();
  const voiceTranscript = useVoiceTranscript(voiceStatus?.active ?? false);

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "voice">("chat");
  const [selectedAgent, setSelectedAgent] = useState<string>("kitchen");

  // text chat
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // voice
  const [voiceConn, setVoiceConn] = useState<VoiceConnState>("disconnected");
  const [muted, setMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceBottomRef = useRef<HTMLDivElement>(null);

  // auto-scroll
  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === "function") {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (voiceBottomRef.current && typeof voiceBottomRef.current.scrollIntoView === "function") {
      voiceBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [voiceTranscript]);

  // ── Text chat ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput("");
    setChatLoading(true);

    const userMsg: ChatMessage = { role: "user", content: msg };
    const pendingMsg: ChatMessage = { role: "assistant", content: "", pending: true };
    setChatHistory((h) => [...h, userMsg, pendingMsg]);

    try {
      const historyForApi = chatHistory
        .filter((m) => !m.pending)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, agentId: selectedAgent, history: historyForApi }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      // eslint-disable-next-line no-constant-condition
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
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              assistantText += parsed.text;
              setChatHistory((h) => {
                const updated = [...h];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Error";
      setChatHistory((h) => {
        const updated = [...h];
        updated[updated.length - 1] = { role: "assistant", content: `⚠ ${errMsg}` };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  }, [input, chatLoading, chatHistory, selectedAgent]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Voice connect / disconnect ────────────────────────────────────────────
  const disconnectVoice = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVoiceConn("disconnected");
    setMuted(false);
  }, []);

  const connectVoice = useCallback(async () => {
    if (voiceConn === "connecting" || voiceConn === "connected") return;
    setVoiceConn("connecting");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      const ws = new WebSocket(`ws://localhost:7860?agent=${selectedAgent}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setVoiceConn("connected");
        const source = ctx.createMediaStreamSource(micStream);
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN || muted) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
          }
          ws.send(int16.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer) || ctx.state === "closed") return;
        const int16 = new Int16Array(e.data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
        const buf = ctx.createBuffer(1, float32.length, 16000);
        buf.getChannelData(0).set(float32);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      };

      ws.onerror = () => setVoiceConn("error");
      ws.onclose = () => disconnectVoice();
    } catch {
      setVoiceConn("error");
    }
  }, [voiceConn, selectedAgent, muted, disconnectVoice]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const serverStatus: "active" | "inactive" | "unavailable" = voiceStatus?.error
    ? "unavailable" : voiceStatus?.active ? "active" : "inactive";
  const selectedAgentLabel = AGENTS.find((a) => a.id === selectedAgent)?.label ?? selectedAgent;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MicIcon className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-amber-500 uppercase tracking-wide">
            Voice &amp; Chat
          </span>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="ml-1 rounded-md border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <svg xmlns="http://www.w3.org/2000/svg"
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 w-fit rounded-lg bg-slate-800/60 p-1 mb-3">
            {(["chat", "voice"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={["px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                  activeTab === tab
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    : "text-slate-400 hover:text-slate-200",
                ].join(" ")}>
                {tab}
              </button>
            ))}
          </div>

          {/* ── CHAT TAB ── */}
          {activeTab === "chat" && (
            <div className="flex flex-col gap-2">
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {chatHistory.length === 0 ? (
                  <p className="text-xs text-slate-600 italic py-4 text-center">
                    Chat with {selectedAgentLabel} — ask about your agents, skills, or knowledge base
                  </p>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`text-xs rounded-lg px-3 py-2 ${
                      msg.role === "user"
                        ? "bg-slate-700/70 text-slate-200 ml-6"
                        : "bg-slate-800/80 text-slate-100 mr-6 border border-slate-700/40"
                    }`}>
                      <span className="font-semibold text-slate-400 text-[10px] block mb-0.5">
                        {msg.role === "user" ? "You" : selectedAgentLabel}
                      </span>
                      <span className={msg.pending ? "text-slate-500 animate-pulse" : ""}>
                        {msg.content || (msg.pending ? "…" : "")}
                      </span>
                    </div>
                  ))
                )}
                <div ref={chatBottomRef} />
              </div>
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={`Message ${selectedAgentLabel}… (Enter to send)`}
                  rows={2}
                  disabled={chatLoading}
                  className="flex-1 resize-none rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || chatLoading}
                  className="flex-shrink-0 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send"
                >
                  <SendIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── VOICE TAB ── */}
          {activeTab === "voice" && (
            <div className="flex flex-col gap-3">
              {/* Server status */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  serverStatus === "active" ? "bg-emerald-500 animate-pulse"
                    : serverStatus === "unavailable" ? "bg-rose-500" : "bg-slate-600"
                }`} />
                <span>
                  Pipecat:{" "}
                  <span className={
                    serverStatus === "active" ? "text-emerald-400"
                      : serverStatus === "unavailable" ? "text-rose-400" : "text-slate-400"
                  }>
                    {serverStatus === "active" ? "running" : serverStatus === "unavailable" ? "unavailable" : "not running"}
                  </span>
                  {voiceStatus?.duration_secs != null && (
                    <span className="ml-2 text-slate-600">· last {formatDuration(voiceStatus.duration_secs)}</span>
                  )}
                </span>
              </div>

              {/* Connect controls */}
              <div className="flex flex-wrap items-center gap-2">
                {(voiceConn === "disconnected" || voiceConn === "error") && (
                  <button onClick={connectVoice}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                    <MicIcon className="h-3 w-3" />
                    Connect to {selectedAgentLabel}
                  </button>
                )}
                {voiceConn === "connecting" && (
                  <span className="text-xs text-amber-400 animate-pulse flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    Connecting…
                  </span>
                )}
                {voiceConn === "connected" && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live · {selectedAgentLabel}
                    </span>
                    <button onClick={() => setMuted((m) => !m)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        muted
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                          : "border-slate-600/50 bg-slate-800/60 text-slate-300 hover:text-slate-100"
                      }`}>
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    <button onClick={disconnectVoice}
                      className="rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                      Disconnect
                    </button>
                  </>
                )}
                {voiceConn === "error" && (
                  <span className="text-xs text-rose-400">Failed — is the Pipecat server running?</span>
                )}
              </div>

              {voiceConn === "disconnected" && (
                <p className="text-xs text-slate-600 italic">
                  Start the voice server:{" "}
                  <code className="text-slate-500">cd voice-server && python server.py</code>
                </p>
              )}

              {/* Voice transcript */}
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {voiceTranscript.length === 0 ? (
                  <p className="text-xs text-slate-600 italic py-2">No voice transcripts yet</p>
                ) : (
                  voiceTranscript.map((entry, i) => (
                    <div key={i} className={`text-xs rounded px-2 py-1 ${
                      entry.role === "user"
                        ? "bg-slate-700/60 text-slate-200"
                        : "bg-amber-900/20 text-amber-100 ml-4"
                    }`}>
                      <span className="font-semibold text-slate-400 mr-1">
                        {entry.role === "user" ? "You" : "Agent"}:
                      </span>
                      {entry.content}
                    </div>
                  ))
                )}
                <div ref={voiceBottomRef} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
