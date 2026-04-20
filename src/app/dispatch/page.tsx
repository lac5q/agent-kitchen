import { DispatchPanel } from "@/components/dispatch/dispatch-panel";
import { AgentCardsPanel } from "@/components/dispatch/agent-cards-panel";

export default function DispatchPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Dispatch</h1>
        <p className="text-sm text-slate-500 mt-1">
          Send tasks to remote agents and monitor delegations
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <DispatchPanel />
        <AgentCardsPanel />
      </div>
    </div>
  );
}
