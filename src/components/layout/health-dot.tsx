"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_COLORS } from "@/lib/constants";

interface HealthDotProps {
  service: string;
  status: "up" | "degraded" | "down";
  latencyMs: number | null;
}

export function HealthDot({ service, status, latencyMs }: HealthDotProps) {
  const color = STATUS_COLORS[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: status === "up" ? `0 0 6px ${color}` : undefined }}
          />
          <span className="text-xs text-slate-500">{service}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{service}: {status}{latencyMs !== null ? ` (${latencyMs}ms)` : ""}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
