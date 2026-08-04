import { NOC } from "@/lib/noc-theme";

const rows = Array.from({ length: 6 }, (_, index) => index);

export default function Loading() {
  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            className="h-3 w-28 animate-pulse"
            style={{ background: NOC.ruleStrong }}
          />
          <div
            className="mt-3 h-8 w-64 animate-pulse"
            style={{ background: NOC.rule }}
          />
        </div>
        <div
          className="h-9 w-40 animate-pulse"
          style={{ background: NOC.rule }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {rows.slice(0, 4).map((row) => (
          <div
            key={row}
            className="h-28 animate-pulse border"
            style={{ borderColor: NOC.rule, background: NOC.paper }}
          />
        ))}
      </div>
      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(12rem,1.5fr)_minmax(10rem,1fr)]">
        <div
          className="min-h-[320px] animate-pulse border"
          style={{ borderColor: NOC.rule, background: NOC.paper }}
        />
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row}
              className="h-14 animate-pulse border"
              style={{ borderColor: NOC.rule, background: NOC.paper }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
