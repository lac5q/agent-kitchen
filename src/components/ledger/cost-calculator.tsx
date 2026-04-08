"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CostCalculatorProps {
  totalInput: number;
  totalOutput: number;
  tokensSaved: number;
}

export function CostCalculator({
  totalInput,
  totalOutput,
  tokensSaved,
}: CostCalculatorProps) {
  const [inputRate, setInputRate] = useState(3);
  const [outputRate, setOutputRate] = useState(15);

  const estimatedSpend =
    (totalInput / 1_000_000) * inputRate +
    (totalOutput / 1_000_000) * outputRate;

  const rtkSavings = (tokensSaved / 1_000_000) * inputRate;

  return (
    <Card className="border-slate-800 bg-slate-900/50 p-5">
      <p className="text-sm font-medium text-slate-300 mb-4">Cost Calculator</p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-500">Input $/1M tokens</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={inputRate}
            onChange={(e) => setInputRate(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-800 border-slate-700 text-slate-100"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-500">Output $/1M tokens</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={outputRate}
            onChange={(e) => setOutputRate(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-800 border-slate-700 text-slate-100"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/30 p-4">
          <p className="text-xs text-slate-400 mb-1">Estimated Spend</p>
          <p className="text-2xl font-bold text-rose-400">
            ${estimatedSpend.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 p-4">
          <p className="text-xs text-slate-400 mb-1">RTK Savings</p>
          <p className="text-2xl font-bold text-emerald-400">
            ${rtkSavings.toFixed(2)}
          </p>
        </div>
      </div>
    </Card>
  );
}
