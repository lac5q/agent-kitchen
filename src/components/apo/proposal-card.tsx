"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ApoProposal } from "@/types";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface ProposalCardProps {
  proposal: ApoProposal;
  onClick: (proposal: ApoProposal) => void;
}

export function ProposalCard({ proposal, onClick }: ProposalCardProps) {
  const isPending = proposal.status === "pending";
  const preview = proposal.content.slice(0, 200).replace(/#+\s/g, "").trim();

  return (
    <Card
      className={[
        "border-slate-800 bg-slate-900/50 p-4 cursor-pointer transition-colors",
        "hover:border-slate-700 hover:bg-slate-800/60",
        isPending ? "border-l-2 border-l-amber-500" : "",
      ].join(" ")}
      onClick={() => onClick(proposal)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-100 text-sm truncate">
              {proposal.skill}
            </span>
            <Badge
              variant="outline"
              className={
                isPending
                  ? "border-amber-500/50 text-amber-400 text-xs"
                  : "border-slate-600 text-slate-400 text-xs"
              }
            >
              {proposal.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            subsystem: <span className="text-slate-400">{proposal.subsystem}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDateTime(proposal.timestamp)}
          </p>
          <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
            {preview}
            {proposal.content.length > 200 && "…"}
          </p>
        </div>
      </div>
    </Card>
  );
}
