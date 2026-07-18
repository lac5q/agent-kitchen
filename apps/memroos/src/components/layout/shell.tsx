"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { SectionTabs, type SectionTab } from "./section-tabs";
import { TopBar } from "./top-bar";
import { StoragePanicBanner } from "./storage-panic-banner";
import { useHealth } from "@/lib/api-client";
import { NOC } from "@/lib/noc-theme";

const ROUTE_TABS: Array<{ match: string[]; tabs: SectionTab[] }> = [
  {
    match: ["/", "/ledger", "/business-ops"],
    tabs: [
      { label: "NOC", href: "/", hint: "Operations command center" },
      { label: "Ledger", href: "/ledger", hint: "Token spend and model economics" },
      { label: "Business Ops", href: "/business-ops", hint: "Business outcome and L3 scoring" },
    ],
  },
  {
    match: ["/notebooks", "/library"],
    tabs: [
      { label: "Notebooks", href: "/notebooks", hint: "Browse retained memory entries" },
      { label: "Knowledge", href: "/library", hint: "Inspect the searchable knowledge library" },
    ],
  },
  {
    match: ["/apo", "/seal", "/evals", "/agent-autogen", "/memory-autogen"],
    tabs: [
      { label: "APO", href: "/apo", hint: "Agent performance optimizer proposals" },
      { label: "SEAL", href: "/seal", hint: "Self-editing agent loop approvals" },
      { label: "Evals", href: "/evals", hint: "Evaluation runs and drift guardrails" },
      { label: "Agent Autogen", href: "/agent-autogen", hint: "Generated agent card candidates" },
      { label: "Memory Autogen", href: "/memory-autogen", hint: "Generated memory policy proposals" },
    ],
  },
  {
    match: ["/audit", "/escalations", "/team", "/settings/api-keys", "/settings/compliance"],
    tabs: [
      { label: "Audit", href: "/audit", hint: "Immutable decision and action history" },
      { label: "Escalations", href: "/escalations", hint: "Human-in-the-loop review queue" },
      { label: "Team", href: "/team", hint: "Members, roles, and invitations" },
      { label: "API Keys", href: "/settings/api-keys", hint: "Operator API key management" },
      { label: "Compliance", href: "/settings/compliance", hint: "Compliance exports and controls" },
    ],
  },
];

const SHELLLESS_ROUTES = ["/login", "/register", "/invite", "/understand"];

function isShelllessRoute(pathname: string): boolean {
  return SHELLLESS_ROUTES.some((route) =>
    route === pathname || pathname.startsWith(`${route}/`)
  );
}

function getRouteTabs(pathname: string): SectionTab[] | null {
  const routeGroup = ROUTE_TABS.find((group) =>
    group.match.some((route) =>
      route === "/" ? pathname === "/" : pathname.startsWith(route)
    )
  );

  return routeGroup?.tabs ?? null;
}

export function Shell({
  children,
  publicLandingHost,
}: {
  children: React.ReactNode;
  publicLandingHost: boolean;
}) {
  const pathname = usePathname();

  if ((pathname === "/" && publicLandingHost) || isShelllessRoute(pathname)) {
    return <>{children}</>;
  }

  return <ShellFrame pathname={pathname}>{children}</ShellFrame>;
}

function ShellFrame({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const { data } = useHealth();
  const services = data?.services || [];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const routeTabs = getRouteTabs(pathname);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar services={services} onMenuClick={() => setSidebarOpen(true)} />
      <main
        className="ak-workspace mt-14 box-border min-h-screen max-w-full overflow-x-hidden p-4 lg:ml-[232px] lg:p-6"
        style={{ background: NOC.cream }}
      >
        <StoragePanicBanner services={services} />
        {routeTabs && <SectionTabs tabs={routeTabs} />}
        {children}
      </main>
    </>
  );
}
