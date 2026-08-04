"use client";

import { useEffect, useState } from "react";
import { NOC } from "@/lib/noc-theme";

interface ViewingAs {
  targetUserId: string;
  targetName: string;
  actorUserId: string;
  expiresAt: string;
}

interface MeResponse {
  viewingAs?: ViewingAs;
}

async function fetchSession(): Promise<MeResponse> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (!response.ok) throw new Error("session unavailable");
  return response.json() as Promise<MeResponse>;
}

export function ViewAsBanner() {
  const [viewingAs, setViewingAs] = useState<ViewingAs | undefined>();
  const [exitPending, setExitPending] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSession()
      .then((session) => {
        if (active) setViewingAs(session.viewingAs);
      })
      .catch(() => {
        if (active) setViewingAs(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  async function exitViewAs() {
    setExitPending(true);
    setExitError(null);
    try {
      const response = await fetch("/api/admin/view-as", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not exit view-as");
      window.location.reload();
    } catch (error) {
      setExitPending(false);
      setExitError(error instanceof Error ? error.message : "Could not exit view-as");
    }
  }

  if (!viewingAs) return null;

  return (
    <div
      className="mb-4 flex items-center justify-between gap-4 border px-4 py-3 text-sm"
      role="status"
      style={{ background: NOC.warnBg, borderColor: NOC.peachWarm, color: NOC.terraDeep }}
    >
      <span>
        Viewing as <strong>{viewingAs.targetName}</strong> — read-only
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {exitError && <span role="alert">{exitError}</span>}
        <button
          type="button"
          onClick={() => void exitViewAs()}
          disabled={exitPending}
          className="font-semibold underline disabled:opacity-50"
        >
          {exitPending ? "Exiting…" : "Exit"}
        </button>
      </span>
    </div>
  );
}
