"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useAgents } from "@/lib/api-client";
import { PLATFORM_LABELS } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

// ── Core send logic (shared by chat + voice) ──────────────────────────────────

async function streamChat(
  message: string,
  agentId: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      agentId,
      history: history.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content })).slice(-10),
    }),
  });

  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let streamError: string | null = null;

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
        if (parsed.error) { streamError = parsed.error; break; }
        if (parsed.text) { full += parsed.text; onChunk(full); }
      } catch { /* skip malformed lines */ }
    }
    if (streamError) break;
  }
  if (streamError) throw new Error(streamError);
  return full;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoicePanel() {
  const { data: agentsData } = useAgents();
  const rawAgents = agentsData?.agents ?? [];

  const agents = [...rawAgents].sort((a, b) => {
    const runtimeA = PLATFORM_LABELS[a.platform as string] ?? a.platform ?? "zzz";
    const runtimeB = PLATFORM_LABELS[b.platform as string] ?? b.platform ?? "zzz";
    const aLabel = `${runtimeA} ${a.name}`;
    const bLabel = `${runtimeB} ${b.name}`;
    return aLabel.localeCompare(bLabel);
  });

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "voice">("chat");
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  // shared conversation history (chat + voice use the same thread)
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // chat input
  const [input, setInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // voice state
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // default agent
  useEffect(() => {
    if (!selectedAgent && agents.length > 0) setSelectedAgent(agents[0].id);
  }, [agents, selectedAgent]);

  // auto-scroll
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const selectedAgentLabel = agents.find((a) => a.id === selectedAgent)?.name ?? selectedAgent;

  // ── Send a message (used by both chat input and voice recognition) ──────────
  const send = useCallback(async (msg: string) => {
    if (!msg.trim() || loading) return;
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: msg };
    const pendingMsg: ChatMessage = { role: "assistant", content: "", pending: true };
    setHistory((h) => [...h, userMsg, pendingMsg]);

    try {
      const snapshot = history.filter((m) => !m.pending);
      let assistantText = "";
      await streamChat(msg, selectedAgent, snapshot, (text) => {
        assistantText = text;
        setHistory((h) => {
          const updated = [...h];
          updated[updated.length - 1] = { role: "assistant", content: text };
          return updated;
        });
      });
      return assistantText;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Error";
      setHistory((h) => {
        const updated = [...h];
        updated[updated.length - 1] = { role: "assistant", content: `⚠ ${errMsg}` };
        return updated;
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [loading, history, selectedAgent]);

  // ── Chat tab: send on Enter ───────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
      setInput("");
    }
  };

  const onSendClick = () => { send(input); setInput(""); };

  // ── Voice tab: mic toggle ────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
  }, []);

  const speak = useCallback(async (text: string) => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, agentId: selectedAgent }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setSpeaking(false); audioRef.current = null; };
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, [selectedAgent]);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;

    if (!SR) { alert("Speech recognition not supported in this browser. Use Chrome."); return; }
    if (listening) { stopListening(); return; }

    // Stop TTS if speaking
    window.speechSynthesis?.cancel();
    setSpeaking(false);

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;
    setListening(true);
    setInterimText("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      const results = Array.from(event.results) as any[];
      const interim = results.map((r) => r[0].transcript).join("");
      setInterimText(interim);

      const final = results.filter((r) => r.isFinal).map((r) => r[0].transcript).join("");
      if (final) {
        setInterimText("");
        stopListening();
        send(final).then((response) => {
          if (response) speak(response);
        });
      }
    };

    rec.onerror = () => { stopListening(); };
    rec.onend = () => { setListening(false); setInterimText(""); };
    rec.start();
  }, [listening, stopListening, send, speak]);

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
            onChange={(e) => { setSelectedAgent(e.target.value); setHistory([]); }}
            className="ml-1 rounded-md border border-slate-700/60 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.platform
                  ? `${PLATFORM_LABELS[a.platform as string] ?? a.platform} → ${a.name}`
                  : a.name}
              </option>
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

          {/* Shared conversation history */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 mb-3">
            {history.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-4 text-center">
                {activeTab === "chat"
                  ? `Ask ${selectedAgentLabel} what they're working on`
                  : `Tap the mic and speak to ${selectedAgentLabel}`}
              </p>
            ) : (
              history.map((msg, i) => (
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

          {/* ── CHAT INPUT ── */}
          {activeTab === "chat" && (
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${selectedAgentLabel}… (Enter to send)`}
                rows={2}
                disabled={loading}
                className="flex-1 resize-none rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={onSendClick}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Send"
              >
                <SendIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── VOICE CONTROLS ── */}
          {activeTab === "voice" && (
            <div className="flex flex-col items-center gap-3 py-2">
              {/* Big mic button */}
              <button
                onClick={startListening}
                disabled={loading}
                className={[
                  "relative flex items-center justify-center rounded-full w-16 h-16 transition-all",
                  listening
                    ? "bg-rose-500/20 border-2 border-rose-500 text-rose-400 scale-110"
                    : speaking
                    ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                    : "bg-amber-500/10 border-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500",
                  loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
                aria-label={listening ? "Stop listening" : "Start listening"}
              >
                <MicIcon className="h-7 w-7" />
                {listening && (
                  <span className="absolute inset-0 rounded-full border-2 border-rose-500 animate-ping opacity-30" />
                )}
              </button>

              {/* Status text */}
              <p className="text-xs text-slate-500">
                {loading ? (
                  <span className="text-amber-400 animate-pulse">{selectedAgentLabel} is thinking…</span>
                ) : speaking ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Speaking
                  </span>
                ) : listening ? (
                  <span className="text-rose-400 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                    Listening… tap to stop
                  </span>
                ) : (
                  `Tap mic to speak with ${selectedAgentLabel}`
                )}
              </p>

              {/* Interim transcript (what it's hearing) */}
              {interimText && (
                <p className="text-xs text-slate-500 italic px-4 text-center">
                  &ldquo;{interimText}&rdquo;
                </p>
              )}

              {/* Stop speaking button */}
              {speaking && (
                <button
                  onClick={() => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setSpeaking(false); }}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  Stop speaking
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
