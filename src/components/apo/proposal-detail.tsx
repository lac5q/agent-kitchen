"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { ApoProposal } from "@/types";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface ProposalDetailProps {
  proposal: ApoProposal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProposalDetail({
  proposal,
  open,
  onOpenChange,
}: ProposalDetailProps) {
  if (!proposal) return null;

  const isPending = proposal.status === "pending";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-slate-800 bg-slate-950 text-slate-100 w-[480px] sm:max-w-[480px] flex flex-col"
      >
        <SheetHeader className="pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-start gap-2 flex-wrap">
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
            <Badge
              variant="outline"
              className="border-slate-700 text-slate-400 text-xs"
            >
              {proposal.subsystem}
            </Badge>
          </div>
          <SheetTitle className="text-slate-100 text-base leading-snug mt-1">
            {proposal.skill}
          </SheetTitle>
          <SheetDescription className="text-slate-500 text-xs">
            {formatDateTime(proposal.timestamp)} &middot; {proposal.filename}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
            {proposal.content}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}
