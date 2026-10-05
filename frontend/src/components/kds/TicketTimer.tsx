import { ELAPSED_PLACEHOLDER, elapsedMsSince, formatElapsed } from "@/lib/timers";

interface TicketTimerProps {
  /** Timestamp the clock runs from — kitchen-send time, or bump time in Recall. */
  startedAt: Date;
  /** Shared clock, or null before mount. */
  now: number | null;
  className?: string;
}

export function TicketTimer({ startedAt, now, className }: TicketTimerProps) {
  const label =
    now === null
      ? ELAPSED_PLACEHOLDER
      : formatElapsed(elapsedMsSince(startedAt, now));

  return (
    <span className={className} role="timer" aria-label={`Elapsed ${label}`}>
      {label}
    </span>
  );
}
