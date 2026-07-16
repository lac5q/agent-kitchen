"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import type { MetricEnvelope } from "@/lib/metric-status";

interface CostCalculatorProps {
  totalInput: number;
  totalOutput: number;
  tokensSaved: number;
  savingsEnvelope?: MetricEnvelope<number>;
}

export function CostCalculator({
  totalInput,
  totalOutput,
  tokensSaved,
  savingsEnvelope,
}: CostCalculatorProps) {
  const [inputRate, setInputRate] = useState(3);
  const [outputRate, setOutputRate] = useState(15);

  // Per VAL-LEDGER-001, savings cannot be measured without a retained
  // baseline. Compute spend honestly, but only compute savings when the
  // envelope proves a successful measurement (live or zero).
  const savingsLive = savingsEnvelope?.status === "live" || savingsEnvelope?.status === "zero";
  const estimatedSpend =
    (totalInput / 1_000_000) * inputRate +
    (totalOutput / 1_000_000) * outputRate;

  const rtkSavings = savingsLive ? (tokensSaved / 1_000_000) * inputRate : null;

  return (
    <Card className="border-stone-200 bg-white/90 p-5" data-cost-source={savingsEnvelope?.source ?? "/api/tokens"}>
      <p className="flex items-center text-sm font-medium text-stone-600 mb-4">
        Cost Calculator
        <InfoTip text="Estimates your AI spend based on actual token usage from RTK logs. Enter your model's per-million-token rates to see Estimated Spend (what you paid). RTK Savings (what RTK avoided) only renders when the savings envelope proves a successful measurement — never as a fabricated zero baseline." />
      </p>
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-stone-500">Input $/1M tokens</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={inputRate}
            onChange={(e) => setInputRate(parseFloat(e.target.value) || 0)}
            className="w-full bg-stone-100 border-stone-300 text-stone-950"
            data-cost-input-rate
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-stone-500">Output $/1M tokens</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={outputRate}
            onChange={(e) => setOutputRate(parseFloat(e.target.value) || 0)}
            className="w-full bg-stone-100 border-stone-300 text-stone-950"
            data-cost-output-rate
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/30 p-4" data-cost-spend-card>
          <p className="text-xs text-stone-500 mb-1">Estimated Spend</p>
          <p className="text-2xl font-bold text-rose-400">
            ${estimatedSpend.toFixed(2)}
          </p>
          <p className="mt-1 text-[10px] text-stone-400">
            from totalInput/totalOutput ({savingsEnvelope?.source ?? "/api/tokens"})
          </p>
        </div>
        <div
          className={`rounded-lg border p-4 ${rtkSavings === null ? "border-stone-300 bg-stone-100" : "border-emerald-900/40 bg-emerald-950/30"}`}
          data-cost-savings-card
          data-cost-savings-status={savingsEnvelope?.status ?? "no-source"}
        >
          <p className="text-xs text-stone-500 mb-1">RTK Savings</p>
          {rtkSavings === null ? (
            <p className="text-base font-semibold text-stone-500" data-cost-savings-empty>
              Unavailable — no retained-memory baseline
            </p>
          ) : (
            <p className="text-2xl font-bold text-emerald-400" data-cost-savings-value>
              ${rtkSavings.toFixed(2)}
            </p>
          )}
          <p className="mt-1 text-[10px] text-stone-400">
            {savingsEnvelope?.reason ?? "Savings baseline must be a successful measurement; never a fabricated zero."}
          </p>
        </div>
      </div>
    </Card>
  );
}
