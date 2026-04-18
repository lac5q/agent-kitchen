"use client";

import { useRef, useEffect, useState } from "react";
import { useVoiceStatus } from "@/lib/api-client";
import { useVoiceTranscript } from "./useVoiceTranscript";

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusDot({ status }: { status: "active" | "inactive" | "unavailable" }) {
  if (status === "active") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs text-emerald-400">Active</span>
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
        <span className="text-xs text-rose-400">Unavailable</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
      <span className="text-xs text-slate-400">Inactive</span>
    </span>
  );
}

export function VoicePanel() {
  const { data: voiceStatus } = useVoiceStatus();
  const transcript = useVoiceTranscript(voiceStatus?.active ?? false);
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new transcript entries arrive
  useEffect(() => {
    if (!collapsed && bottomRef.current && typeof bottomRef.current.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, collapsed]);

  const status: "active" | "inactive" | "unavailable" = voiceStatus?.error
    ? "unavailable"
    : voiceStatus?.active
    ? "active"
    : "inactive";

  const duration = voiceStatus?.duration_secs ?? null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <p className="text-xs font-medium text-slate-500">Voice Server</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            aria-label={collapsed ? "Expand voice panel" : "Collapse voice panel"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Session duration */}
          {duration !== null && (
            <p className="text-xs text-slate-500 mb-2">
              {status === "active"
                ? `Session: ${formatDuration(duration)}`
                : `Last session: ${formatDuration(duration)}`}
            </p>
          )}

          {/* Transcript */}
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {transcript.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No voice transcripts yet</p>
            ) : (
              transcript.map((entry, i) => (
                <div
                  key={i}
                  className={`text-xs rounded px-2 py-1 ${
                    entry.role === "user"
                      ? "bg-slate-700 text-slate-200 self-start"
                      : "bg-amber-900/30 text-amber-100 text-right ml-4"
                  }`}
                >
                  <span className="font-semibold text-slate-400 mr-1">
                    {entry.role === "user" ? "You" : "Assistant"}:
                  </span>
                  {entry.content}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </>
      )}
    </div>
  );
}
