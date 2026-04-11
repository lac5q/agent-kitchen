"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Event {
  id: string;
  timestamp: string;
  node: string;
  type: string;
  message: string;
  severity: string;
}

interface NodeDetailPanelProps {
  nodeId: string | null;
  nodeLabel: string;
  nodeIcon: string;
  nodeStats: Record<string, string | number>;
  events: Event[];
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  error: "#f43f5e",
  apo: "#8b5cf6",
};

export function NodeDetailPanel({ nodeId, nodeLabel, nodeIcon, nodeStats, events, onClose }: NodeDetailPanelProps) {
  const nodeEvents = events.filter(e => e.node === nodeId).slice(0, 15);

  const [heartbeatContent, setHeartbeatContent] = useState<string | null>(null);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);

  useEffect(() => {
    if (!nodeId) {
      setHeartbeatContent(null);
      return;
    }
    setHeartbeatLoading(true);
    fetch(`/api/heartbeat?agent=${nodeId}`)
      .then(r => {
        if (!r.ok) throw new Error(`heartbeat ${r.status}`);
        return r.json();
      })
      .then(d => setHeartbeatContent(d.content ?? null))
      .catch(() => setHeartbeatContent(null))
      .finally(() => setHeartbeatLoading(false));
  }, [nodeId]);

  return (
    <AnimatePresence>
      {nodeId && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute right-0 top-0 bottom-0 w-80 bg-slate-950 border-l border-slate-800 z-50 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{nodeIcon}</span>
              <div>
                <p className="text-sm font-bold text-amber-500">{nodeLabel}</p>
                <p className="text-xs text-slate-500">
                  {heartbeatContent ? "Last State" : "Node Activity"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg" aria-label="Close node detail panel">×</button>
          </div>

          {/* Stats */}
          {Object.keys(nodeStats).length > 0 && (
            <div className="p-4 border-b border-slate-800">
              <p className="text-xs font-medium text-slate-500 mb-2">Stats</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(nodeStats).map(([k, v]) => (
                  <div key={k} className="bg-slate-900 rounded p-2">
                    <p className="text-xs text-slate-500">{k}</p>
                    <p className="text-sm font-bold text-slate-200">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Heartbeat / Last State */}
          {heartbeatLoading && (
            <div className="p-4 border-b border-slate-800">
              <p className="text-xs text-slate-500">Loading state...</p>
            </div>
          )}
          {!heartbeatLoading && heartbeatContent && (
            <div className="p-4 border-b border-slate-800">
              <p className="text-xs font-medium text-slate-500 mb-2">Last State</p>
              <pre className="font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">{heartbeatContent}</pre>
            </div>
          )}

          {/* Events */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs font-medium text-slate-500 mb-3">
              Recent Activity {nodeEvents.length > 0 ? `(${nodeEvents.length})` : "(none)"}
            </p>
            {nodeEvents.length === 0 ? (
              <p className="text-xs text-slate-600">No recent activity for this node</p>
            ) : (
              <div className="space-y-2">
                {nodeEvents.map(event => {
                  const minsAgo = Math.round((Date.now() - new Date(event.timestamp).getTime()) / 60000);
                  const timeLabel = minsAgo < 1 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;
                  const color = TYPE_COLORS[event.type] || "#64748b";
                  return (
                    <div key={event.id} className="text-xs border-l-2 pl-2 py-1" style={{ borderColor: color }}>
                      <p className="text-slate-500 mb-0.5">{timeLabel}</p>
                      <p className={`${event.severity === "error" ? "text-rose-400" : "text-slate-300"}`}>
                        {event.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
