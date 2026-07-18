import {
  describeMetricEnvelope,
  type MetricEnvelope,
  type MetricStatus,
} from "@/lib/metric-status";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";

export type SignalSeverity = "high" | "med" | "low" | "info";

export function formatObservedAt(observedAt: string | null): string {
  if (!observedAt) return "—";
  const date = new Date(observedAt);
  if (!Number.isFinite(date.getTime())) return observedAt;
  return date.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function formatFreshness(freshnessMs: number | null): string {
  if (freshnessMs === null || !Number.isFinite(freshnessMs)) return "—";
  if (freshnessMs < 60_000) return `${Math.max(0, Math.round(freshnessMs / 1000))}s`;
  if (freshnessMs < 60 * 60_000) return `${Math.round(freshnessMs / 60_000)}m`;
  if (freshnessMs < 24 * 60 * 60_000) return `${Math.round(freshnessMs / (60 * 60_000))}h`;
  return `${Math.round(freshnessMs / (24 * 60 * 60_000))}d`;
}

export function statusBadgeColor(status: MetricStatus): { background: string; color: string } {
  switch (status) {
    case "live":
      return { background: NOC.successBg, color: NOC.success };
    case "zero":
      return { background: NOC.successBg, color: NOC.success };
    case "empty":
      return { background: NOC.fog, color: NOC.muted };
    case "stale":
      return { background: NOC.warnBg, color: NOC.warn };
    case "blocked":
      return { background: NOC.warnBg, color: NOC.warn };
    case "unavailable":
      return { background: NOC.warnBg, color: NOC.warn };
    case "degraded":
      return { background: NOC.warnBg, color: NOC.warn };
    case "error":
      return { background: NOC.peach, color: NOC.terra };
  }
}

export function SourceStatusBadge({
  status,
  label,
}: {
  status: MetricStatus;
  label?: string;
}) {
  const { label: stateLabel } = describeMetricEnvelope({
    value: null,
    status,
    source: "",
    observedAt: null,
    freshnessMs: null,
    scope: { window: "24h", workspace: "all" },
    reason: null,
  });
  const { background, color } = statusBadgeColor(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        alignSelf: "flex-start",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        lineHeight: 1.2,
        padding: "2px 6px",
        background,
        color,
        textTransform: "uppercase",
        fontFamily: NOC_FONT_MONO,
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
      data-status={status}
    >
      {label ?? stateLabel}
    </span>
  );
}

export function EnvelopeCaption({
  envelope,
  showSource = true,
  showFreshness = true,
  showScope = false,
}: {
  envelope: MetricEnvelope<unknown> | undefined | null;
  showSource?: boolean;
  showFreshness?: boolean;
  showScope?: boolean;
}) {
  if (!envelope) {
    return (
      <div style={{ fontSize: 10.5, color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
        source: —
      </div>
    );
  }
  const isLive = envelope.status === "live" || envelope.status === "zero";
  return (
    <div
      style={{
        fontSize: 10.5,
        color: NOC.soft,
        fontFamily: NOC_FONT_MONO,
        lineHeight: 1.5,
        overflowWrap: "anywhere",
      }}
    >
      {showSource && (
        <div>
          source: <span style={{ color: NOC.muted }}>{envelope.source || "—"}</span>
        </div>
      )}
      {!isLive && envelope.reason && (
        <div style={{ color: NOC.terra }}>{envelope.reason}</div>
      )}
      {showScope && (
        <div>
          scope: window={envelope.scope.window}, workspace={envelope.scope.workspace}
        </div>
      )}
      {showFreshness && (
        <div>
          observed: {formatObservedAt(envelope.observedAt)} · age {formatFreshness(envelope.freshnessMs)}
        </div>
      )}
    </div>
  );
}

export function NocCard({
  children,
  pad = 16,
  style,
}: {
  children: React.ReactNode;
  pad?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: NOC.paper,
        border: `1px solid ${NOC.rule}`,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function NocPanelHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingBottom: 10,
        borderBottom: `1px solid ${NOC.rule}`,
        marginBottom: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NOC.ink }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: NOC.soft, marginTop: 2 }}>{hint}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.14em",
        lineHeight: 1.35,
        color: NOC.soft,
        textTransform: "uppercase",
        minWidth: 0,
        maxWidth: "100%",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </div>
  );
}

export function Mono({
  children,
  color = NOC.ink,
  size = 14,
}: {
  children: React.ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <span style={{ fontFamily: NOC_FONT_MONO, color, fontSize: size }}>
      {children}
    </span>
  );
}

export function Delta({ value }: { value: string }) {
  const up = value.startsWith("+");
  const down = value.startsWith("-") || value.startsWith("–");
  const color = up ? NOC.success : down ? NOC.terra : NOC.soft;
  const bg = up ? NOC.successBg : NOC.fog;
  return (
    <span
      style={{
        fontFamily: NOC_FONT_MONO,
        fontSize: 11,
        fontWeight: 600,
        color,
        padding: "1px 5px",
        background: bg,
      }}
    >
      {value}
    </span>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, background: color, display: "inline-block" }} />
      <span style={{ fontSize: 11, color: NOC.soft }}>{label}</span>
    </span>
  );
}

export function PillBtn({
  children,
  href,
  onClick,
  variant = "outline",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "outline" | "solid";
}) {
  const bg = variant === "solid" ? NOC.ink : NOC.paper;
  const fg = variant === "solid" ? NOC.cream : NOC.ink;
  const border = variant === "solid" ? NOC.ink : NOC.ruleStrong;
  const style = {
    background: bg,
    color: fg,
    border: `1px solid ${border}`,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };

  if (href) {
    // Round 4 [F2]: Use a plain anchor for navigation. The previous
    // <Link href> approach could stall the navigation in production
    // (observed for /seal — the click registered but the URL never
    // updated). A plain anchor guarantees GET-only navigation via the
    // browser, with no client-side route hydration required.
    return (
      <a
        href={href}
        style={style}
        data-navigation-element="anchor"
        data-pill-href={href}
      >
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} style={style}>
      {children}
    </button>
  );
}

export function severityColor(sev: SignalSeverity): string {
  if (sev === "high") return NOC.terra;
  if (sev === "med")  return NOC.warn;
  if (sev === "low")  return NOC.info;
  return NOC.soft;
}
