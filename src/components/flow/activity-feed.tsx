"use client";

import { motion, AnimatePresence } from "framer-motion";

const TYPE_COLORS: Record<string, string> = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  error: "#f43f5e",
  apo: "#8b5cf6",
};

const TYPE_ICONS: Record<string, string> = {
  request: "📡",
  knowledge: "📚",
  memory: "🧠",
  error: "⚠️",
  apo: "🔧",
};

interface Event {
  id: string;
  timestamp: string;
  node: string;
  type: string;
  message: string;
  severity: string;
}

export function ActivityFeed({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-600 text-center py-2">No recent activity detected</p>
    );
  }

  return (
    <div className="space-y-1 max-h-[140px] overflow-y-auto">
      <AnimatePresence mode="popLayout">
        {events.slice(0, 10).map((event) => {
          const color = TYPE_COLORS[event.type] || "#64748b";
          const icon = TYPE_ICONS[event.type] || "•";
          const minsAgo = Math.round((Date.now() - new Date(event.timestamp).getTime()) / 60000);
          const timeLabel = minsAgo < 1 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-start gap-2 text-xs"
            >
              <span>{icon}</span>
              <span className="text-slate-500 shrink-0 w-14">{timeLabel}</span>
              <span
                className="shrink-0 w-20 font-medium"
                style={{ color }}
              >
                {event.node}
              </span>
              <span className="text-slate-400 truncate">{event.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
