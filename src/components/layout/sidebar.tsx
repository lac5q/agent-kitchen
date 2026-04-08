"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Kitchen Floor", icon: "\u{1F468}\u200D\u{1F373}" },
  { href: "/ledger", label: "The Ledger", icon: "\u{1F9FE}" },
  { href: "/notebooks", label: "Notebook Wall", icon: "\u{1F9E0}" },
  { href: "/library", label: "The Library", icon: "\u{1F4DA}" },
  { href: "/flow", label: "The Flow", icon: "\u{1F504}" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold text-amber-500">Agent Kitchen</h1>
        <p className="text-xs text-slate-500">Knowledge Restaurant</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-500/10 text-amber-500"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 pt-4 px-2">
        <p className="text-xs text-slate-600">v1.0.0</p>
      </div>
    </aside>
  );
}
