import { useEffect, useState } from "react";
import { Snapshot } from "./types";

export interface StatusData {
  agentEnabled: boolean;
  status: string;
  lastReason: string;
  nextTickAt: number;
  snapshot: Snapshot | null;
}

export function useStatus(intervalMs = 3000) {
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/status`
        );
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error("[useStatus] fetch failed:", e);
      }
    };

    fetchStatus();
    const id = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return data;
}