"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { STATUS_COLORS } from "@/lib/constants";
import type { FlowNode } from "@/types";

interface FlowNodeProps {
  node: FlowNode;
  highlighted: boolean;
}

const NODE_W = 70;
const NODE_H = 70;

export function FlowNodeComponent({ node, highlighted }: FlowNodeProps) {
  const [hovered, setHovered] = useState(false);

  const borderColor = STATUS_COLORS[node.status] ?? STATUS_COLORS.idle;
  const cx = node.x + NODE_W / 2;
  const cy = node.y + NODE_H / 2;

  return (
    <motion.g
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      {/* Pulsing glow for active/highlighted nodes */}
      {(highlighted || node.status === "active") && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={44}
          fill={borderColor}
          fillOpacity={0.08}
          animate={{ r: [38, 46, 38], fillOpacity: [0.06, 0.14, 0.06] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Highlight ring */}
      {highlighted && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={40}
          fill="none"
          stroke={borderColor}
          strokeWidth={2}
          strokeOpacity={0.6}
          animate={{ strokeOpacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Main rounded rect */}
      <motion.rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={NODE_H}
        rx={16}
        fill="#0f172a"
        stroke={borderColor}
        strokeWidth={highlighted ? 2.5 : 1.5}
        animate={{
          stroke: borderColor,
          strokeWidth: highlighted ? 2.5 : 1.5,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Icon */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={24}
        style={{ userSelect: "none" }}
      >
        {node.icon}
      </text>

      {/* Label */}
      <text
        x={cx}
        y={node.y + NODE_H + 14}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#e2e8f0"
        style={{ userSelect: "none" }}
      >
        {node.label}
      </text>

      {/* Subtitle */}
      <text
        x={cx}
        y={node.y + NODE_H + 26}
        textAnchor="middle"
        fontSize={9}
        fill="#64748b"
        style={{ userSelect: "none" }}
      >
        {node.subtitle}
      </text>

      {/* Hover tooltip panel rendered in SVG */}
      {hovered && Object.keys(node.stats).length > 0 && (
        <motion.g
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Tooltip background */}
          <rect
            x={cx - 58}
            y={node.y - 64}
            width={116}
            height={56}
            rx={8}
            fill="#1e293b"
            stroke="#334155"
            strokeWidth={1}
          />
          {Object.entries(node.stats).map(([key, val], i) => (
            <text
              key={key}
              x={cx}
              y={node.y - 50 + i * 14}
              textAnchor="middle"
              fontSize={9}
              fill="#94a3b8"
              style={{ userSelect: "none" }}
            >
              <tspan fill="#cbd5e1" fontWeight={600}>
                {key}:{" "}
              </tspan>
              {String(val)}
            </text>
          ))}
        </motion.g>
      )}
    </motion.g>
  );
}
