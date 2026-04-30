"use client";

import { useQuery } from "@tanstack/react-query";

export interface TranscriptEntry {
  role: string;
  content: string;
  timestamp: string;
}

/**
 * Polls /api/recall?agent_id=voice&limit=50 for voice session transcript entries.
 * Only polls while voice is active (controlled by the `enabled` param).
 * Falls back to an empty array when inactive or on error.
 */
export function useVoiceTranscript(enabled: boolean): TranscriptEntry[] {
  const { data } = useQuery({
    queryKey: ["voice-transcript"],
    queryFn: async (): Promise<TranscriptEntry[]> => {
      const res = await fetch("/api/recall?agent_id=voice&limit=50");
      if (!res.ok) throw new Error(`voice-transcript: ${res.status}`);
      const json = await res.json() as {
        results: Array<{ role: string; content: string; timestamp: string }>;
      };
      return (json.results ?? []).map((r) => ({
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
      }));
    },
    refetchInterval: 5000,
    enabled,
    // Keep stale data visible while re-fetching
    placeholderData: (prev) => prev,
  });

  return data ?? [];
}
