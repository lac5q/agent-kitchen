"use client";

import { useAgentCards } from "@/lib/api-client";
import { PLATFORM_LABELS } from "@/lib/constants";

export function AgentCardsPanel() {
  const { data, isLoading } = useAgentCards();
  const cards = data?.cards ?? [];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-amber-500 mb-4">A2A Agent Cards</h2>
      {isLoading && <p className="text-slate-500 text-sm animate-pulse">Loading…</p>}
      {!isLoading && cards.length === 0 && (
        <p className="text-slate-600 text-sm">No agents configured.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.extensions.kitchen.id}
            className="rounded-lg border border-slate-700 bg-slate-950 p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  <span className="text-slate-500 font-normal">
                    {PLATFORM_LABELS[card.extensions.kitchen.platform] ?? card.extensions.kitchen.platform}
                    {" → "}
                  </span>
                  {card.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{card.extensions.kitchen.role}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 break-all">{card.url}</p>
            {card.skills.length > 0 && (
              <div>
                <p className="text-xs text-slate-600 mb-1">Skills</p>
                <div className="flex flex-wrap gap-1">
                  {card.skills.map((s) => (
                    <span
                      key={s.id}
                      className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded"
                      title={s.description}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-slate-600">
              auth: {card.authentication.schemes.join(", ")} · v{card.version}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
