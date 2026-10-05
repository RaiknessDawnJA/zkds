"use client";

import { useEffect, useState } from "react";

/**
 * One shared clock for the whole screen, so every timer on the board ticks in
 * lockstep instead of each ticket owning its own interval.
 *
 * Returns null until after mount: the server has no meaningful "now" for this
 * client, and rendering a server-side elapsed time would guarantee a hydration
 * mismatch on every ticket.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
