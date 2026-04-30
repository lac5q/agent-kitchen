interface LogViewerProps {
  lines: string[];
}

function classifyLine(line: string): string {
  const upper = line.toUpperCase();
  if (upper.includes("ERROR") || upper.includes("FAIL")) {
    return "text-rose-400";
  }
  if (upper.includes("SUCCESS") || upper.includes("DONE")) {
    return "text-emerald-400";
  }
  if (upper.includes("PROPOSAL")) {
    return "text-amber-400";
  }
  return "text-slate-400";
}

export function LogViewer({ lines }: LogViewerProps) {
  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500 font-mono italic">No log data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-3 max-h-[300px] overflow-y-auto">
      <div className="space-y-0.5">
        {lines.map((line, i) => (
          <p
            key={i}
            className={`text-xs font-mono leading-relaxed whitespace-pre-wrap break-all ${classifyLine(line)}`}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
