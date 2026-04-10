"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface DemoStep {
  nodeId: string;
  caption: string;
}

const DEMO_STEPS: DemoStep[] = [
  { nodeId: "agents",    caption: "1. Agent fails a task → OpenClaw logs the error" },
  { nodeId: "notebooks", caption: "2. Hermes Audit scans mem0 for failure patterns" },
  { nodeId: "qdrant",    caption: "2b. mem0 semantic memory backed by Qdrant Cloud vectors" },
  { nodeId: "librarian", caption: "3. QMD queries knowledge base for context" },
  { nodeId: "cookbooks", caption: "4. Agent Lightning detects the failing skill" },
  { nodeId: "taskboard", caption: "5. APO generates a proposal → queued in Nerve" },
  { nodeId: "gateways",  caption: "6. Luis is alerted via Telegram / Discord" },
  { nodeId: "cookbooks", caption: "7. After approval → skill updated, agents improve" },
];

const STEP_DURATION = 3000; // 3 seconds per step

interface DemoModeProps {
  onHighlight: (nodeId: string | null) => void;
}

export function DemoMode({ onHighlight }: DemoModeProps) {
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const stop = useCallback(() => {
    setRunning(false);
    setStepIndex(-1);
    onHighlight(null);
  }, [onHighlight]);

  useEffect(() => {
    if (!running) return;

    if (stepIndex >= DEMO_STEPS.length) {
      stop();
      return;
    }

    if (stepIndex >= 0) {
      onHighlight(DEMO_STEPS[stepIndex].nodeId);
    }

    const timer = setTimeout(() => {
      setStepIndex((prev) => prev + 1);
    }, STEP_DURATION);

    return () => clearTimeout(timer);
  }, [running, stepIndex, onHighlight, stop]);

  const start = () => {
    setStepIndex(0);
    setRunning(true);
  };

  const currentStep = stepIndex >= 0 && stepIndex < DEMO_STEPS.length
    ? DEMO_STEPS[stepIndex]
    : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={running ? stop : start}
        className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
          running
            ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
        }`}
      >
        {running ? "Stop Demo" : "Demo: APO Improvement Cycle"}
      </button>

      {/* Step progress dots */}
      {running && (
        <div className="flex gap-1.5">
          {DEMO_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === stepIndex ? "bg-amber-400" : i < stepIndex ? "bg-amber-600" : "bg-slate-700"
              }`}
            />
          ))}
        </div>
      )}

      {/* Caption */}
      <div className="h-8 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentStep && (
            <motion.p
              key={stepIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="text-sm text-slate-300 text-center max-w-lg"
            >
              {currentStep.caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
