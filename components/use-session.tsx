"use client";

import { useCallback, useEffect, useState } from "react";

export interface Me {
  loaded: boolean;
  wallet: string | null;
  trust?: number;
  multiplier?: number;
  paused?: boolean;
  labelsTotal?: number;
  labelsApproved?: number;
  lamportsEarned?: string;
  escrowLamports?: string;
  lamportsReleased?: string;
  lamportsSlashed?: string;
  walletBalanceLamports?: string | null;
  escrowAddress?: string | null;
}

export function useSession() {
  const [session, setSession] = useState<Me>({ loaded: false, wallet: null });
  const refresh = useCallback(async () => {
    try {
      const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
      setSession({ loaded: true, ...me });
    } catch {
      setSession({ loaded: true, wallet: null });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { session, refresh, setSession };
}
