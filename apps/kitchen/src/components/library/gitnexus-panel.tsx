"use client";

import { Card } from "@/components/ui/card";

interface GitNexusRepo {
  name: string;
  path: string;
  files: number;
  symbols: number;
  edges: number;
  clusters: number;
  processes: number;
  lastIndexed: string | null;
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function GitNexusPanel({ repos }: { repos: GitNexusRepo[] }) {
  if (repos.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-sm text-slate-500">No GitNexus indexes found. Run <code className="text-amber-400">npx gitnexus analyze</code> in a repo to index it.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {repos.map((repo) => (
        <Card key={repo.name} className="border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-amber-500">{repo.name}</p>
            <p className="text-xs text-slate-600">
              {repo.lastIndexed ? new Date(repo.lastIndexed).toLocaleDateString() : "Never indexed"}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { icon: "📄", label: "Files", value: fmt(repo.files) },
              { icon: "🔣", label: "Symbols", value: fmt(repo.symbols) },
              { icon: "🔗", label: "Edges", value: fmt(repo.edges) },
              { icon: "🫧", label: "Clusters", value: fmt(repo.clusters) },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-xs text-slate-500">{stat.icon} {stat.label}</p>
                <p className="text-sm font-bold text-slate-200">{stat.value}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
