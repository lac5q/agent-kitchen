"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { FlowEdge } from "@/types";

const EDGE_COLORS: Record<FlowEdge["type"], string> = {
  request: "#f59e0b",   // amber
  knowledge: "#10b981", // emerald
  memory: "#0ea5e9",    // sky
  error: "#f43f5e",     // rose
  apo: "#8b5cf6",       // purple
};

interface FlowEdgeProps {
  edge: FlowEdge & { x1: number; y1: number; x2: number; y2: number };
}

export function FlowEdgeComponent({ edge }: FlowEdgeProps) {
  const color = EDGE_COLORS[edge.type] ?? EDGE_COLORS.request;

  // Randomize particle travel duration per edge (stable via useMemo)
  const duration = useMemo(() => 1.5 + Math.random() * 2, []);

  const particleKeyframes = {
    cx: [edge.x1, edge.x2],
    cy: [edge.y1, edge.y2],
  };

  return (
    <g>
      {/* Edge line */}
      <line
        x1={edge.x1}
        y1={edge.y1}
        x2={edge.x2}
        y2={edge.y2}
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />

      {/* Primary particle */}
      <motion.circle
        r={5}
        fill={color}
        fillOpacity={0.9}
        filter={`drop-shadow(0 0 6px ${color})`}
        animate={particleKeyframes}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 0,
        }}
      />

      {/* Staggered second particle */}
      <motion.circle
        r={3}
        fill={color}
        fillOpacity={0.6}
        filter={`drop-shadow(0 0 4px ${color})`}
        animate={particleKeyframes}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          delay: duration / 2,
          repeatDelay: 0,
        }}
      />
    </g>
  );
}
