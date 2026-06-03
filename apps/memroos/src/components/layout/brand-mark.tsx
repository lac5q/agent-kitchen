import { cn } from "@/lib/utils";
import { NOC } from "@/lib/noc-theme";

interface KangarooMarkProps {
  className?: string;
}

export function KangarooMark({ className }: KangarooMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[4px] leading-none",
        className
      )}
      style={{
        background: NOC.terra,
        color: NOC.paper,
        boxShadow: `0 8px 18px color-mix(in srgb, ${NOC.terraDeep} 16%, transparent)`,
      }}
      role="img"
      aria-label="MemroOS stylized kangaroo logo"
    >
      <svg
        aria-hidden="true"
        className="h-[82%] w-[82%]"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M25.5 42.8C17 43.9 10.1 47.6 5.7 53.7"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M30.2 45.7c-6.7-2.6-10.1-9.6-7.9-16.2 2.6-7.8 11.3-11.5 18.8-7.8 6.8 3.3 9.1 12.3 5.3 19.5-3.5 6.5-10.3 7.6-16.2 4.5Z"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinejoin="round"
        />
        <path
          d="M40.3 23.1c2.6-6 7.8-10.5 15.5-13.4 2.3-.9 4.2 1.8 2.6 3.7L49.6 24c3.1 8.6.7 18.2-5.9 23.4"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M47.8 15.5 47.1 7.5M51.2 15.3l7.1-5.9"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30.7 45.8 20.3 57.1c-1 1.1.2 2.8 1.6 2.2l15.7-6.5M40.1 45.6l9.7 11.5M43.5 34.9l11.1 8"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27 38c3.4-4.1 9.5-4.9 13.9-1.7"
          stroke={NOC.peachWarm}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <circle cx="43.2" cy="22.6" r="1.9" fill="currentColor" />
      </svg>
    </span>
  );
}
