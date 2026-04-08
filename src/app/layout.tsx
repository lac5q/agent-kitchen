import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent Kitchen",
  description: "Knowledge Restaurant — AI Agent Observability Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100`}>
        <Providers>
          <Sidebar />
          <main className="ml-64 mt-14 min-h-screen p-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
