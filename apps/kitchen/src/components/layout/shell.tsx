"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { useHealth } from "@/lib/api-client";

export function Shell({ children }: { children: React.ReactNode }) {
  const { data } = useHealth();
  const services = data?.services || [];
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <TopBar services={services} onMenuClick={() => setSidebarOpen(true)} />
      <main className="mt-14 min-h-screen p-4 lg:ml-64 lg:p-6">{children}</main>
    </>
  );
}
