import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeCollection } from "@/types";

const CATEGORY_COLORS: Record<KnowledgeCollection["category"], string> = {
  business: "border-sky-500 bg-sky-500/10",
  agents: "border-emerald-500 bg-emerald-500/10",
  marketing: "border-amber-500 bg-amber-500/10",
  product: "border-purple-500 bg-purple-500/10",
  other: "border-slate-500 bg-slate-500/10",
};

const CATEGORY_BAR_COLORS: Record<KnowledgeCollection["category"], string> = {
  business: "bg-sky-500",
  agents: "bg-emerald-500",
  marketing: "bg-amber-500",
  product: "bg-purple-500",
  other: "bg-slate-500",
};

const CATEGORY_TEXT_COLORS: Record<KnowledgeCollection["category"], string> = {
  business: "text-sky-400",
  agents: "text-emerald-400",
  marketing: "text-amber-400",
  product: "text-purple-400",
  other: "text-slate-400",
};

interface CollectionCardProps {
  collection: KnowledgeCollection;
  maxCount: number;
}

export function CollectionCard({ collection, maxCount }: CollectionCardProps) {
  const { name, docCount, category, lastUpdated } = collection;
  const fillPercent = maxCount > 0 ? (docCount / maxCount) * 100 : 0;
  const borderColor = CATEGORY_COLORS[category];
  const barColor = CATEGORY_BAR_COLORS[category];
  const textColor = CATEGORY_TEXT_COLORS[category];

  return (
    <Card
      className={`border-l-4 border-slate-800 bg-slate-900/60 ${borderColor.split(" ")[0]} p-0`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p
            className="text-sm font-medium text-slate-100 truncate leading-tight"
            title={name}
          >
            {name}
          </p>
          <Badge
            className={`shrink-0 text-xs font-semibold ${textColor} bg-transparent border-current`}
            variant="outline"
          >
            {docCount}
          </Badge>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <p className={`text-xs mt-1.5 ${textColor} capitalize`}>{category}</p>
        {lastUpdated && (
          <p className="text-xs text-slate-500 mt-1" title={lastUpdated}>
            {new Date(lastUpdated).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
