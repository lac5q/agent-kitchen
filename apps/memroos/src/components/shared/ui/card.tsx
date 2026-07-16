import { NOC } from "@/lib/noc-theme";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: 12,
  md: 18,
  lg: 24,
};

export function Card({
  children,
  pad = "md",
  className,
  style,
  ...rest
}: {
  children: ReactNode;
  pad?: CardPadding;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return (
    <section
      {...rest}
      className={className}
      style={{
        background: NOC.paper,
        border: `1px solid ${NOC.rule}`,
        padding: PADDING[pad],
        ...style,
      }}
    >
      {children}
    </section>
  );
}
