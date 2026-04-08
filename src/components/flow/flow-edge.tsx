"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { FlowEdge } from "@/types";

const EDGE_COLORS: Record<FlowEdge["type"], string> = {
  request: "#f59e0b",   // amber
  knowledge: "#10b981", // emerald
  memory: "#0ea5e9",    // sky
  error: "#f43f5e",     // rose
};

interface FlowEdgeProps {
  edge: FlowEdge & { x1: number; y1: number; x2: number; y2: number };
}

export function FlowEdgeComponent({ edge }: FlowEdgeProps) {
  const color = EDGE_COLORS[edge.type] ?? EDGE_COLORS.request;

  // Randomize particle travel duration per edge (stable via useMemo)
  const duration = useMemo(() => 2 + Math.random() * 2, []);

  // Mid-point along the line for particle animation start
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  // Normalized direction
  const nx = len > 0 ? dx / len : 0;
  const ny = len > 0 ? dy / len : 0;

  // Particle travels from (x1,y1) to (x2,y2)
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
        strokeWidth={1.5}
        strokeOpacity={0.35}
        strokeLinecap="round"
      />

      {/* Animated particle */}
      <motion.circle
        r={3.5}
        fill={color}
        fillOpacity={0.85}
        animate={particleKeyframes}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 0,
        }}
      />
    </g>
  );
}
