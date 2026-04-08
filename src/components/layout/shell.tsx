"use client";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { useHealth } from "@/lib/api-client";

export function Shell({ children }: { children: React.ReactNode }) {
  const { data } = useHealth();
  const services = data?.services || [];

  return (
    <>
      <Sidebar />
      <TopBar services={services} />
      <main className="ml-64 mt-14 min-h-screen p-6">{children}</main>
    </>
  );
}
