/**
 * Elapsed time is always derived from timestamps — nothing in this app stores a
 * counter that ticks up, so a paused/backgrounded tab can never drift.
 */
export function elapsedMsSince(start: Date, now: number): number {
  return Math.max(0, now - start.getTime());
}

/**
 * MM:SS, widening to H:MM:SS once a ticket has been up for an hour or more.
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Placeholder shown before the client has a clock (avoids hydration drift). */
export const ELAPSED_PLACEHOLDER = "--:--";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
