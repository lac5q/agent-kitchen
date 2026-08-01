"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";

interface CostCalculatorProps {
  totalInput: number;
  totalOutput: number;
}

export function CostCalculator({
  totalInput,
  totalOutput,
}: CostCalculatorProps) {
  const [inputRate, setInputRate] = useState(3);
  const [outputRate, setOutputRate] = useState(15);

  const estimatedSpend =
    (totalInput / 1_000_000) * inputRate +
    (totalOutput / 1_000_000) * outputRate;

  return (
    <Card className="border-stone-200 bg-white/90 p-5" data-cost-source="/api/model-usage">
      <p className="flex items-center text-sm font-medium text-stone-600 mb-4">
        Cost Calculator
        <InfoTip text="Estimates AI spend from multi-model token totals (input/output from /api/model-usage). Rates are editable assumptions — not billed invoices." />
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
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/30 p-4" data-cost-spend-card>
          <p className="text-xs text-stone-500 mb-1">Estimated Spend</p>
          <p className="text-2xl font-bold text-rose-400">
            ${estimatedSpend.toFixed(2)}
          </p>
          <p className="mt-1 text-[10px] text-stone-400">
            from totalInput/totalOutput (/api/model-usage)
          </p>
        </div>
      </div>
    </Card>
  );
}
