import type { StationTicket } from "@zkds/shared";
import { elapsedMsSince } from "./timers";

export type TicketUrgency = "NORMAL" | "WARNING" | "LATE" | "CRITICAL";

export interface TicketThresholds {
  warningMinutes: number;
  lateMinutes: number;
  criticalMinutes: number;
}

/** Single place to retune how hard the board pushes on the cooks. */
export const ticketThresholds: TicketThresholds = {
  warningMinutes: 5,
  lateMinutes: 8,
  criticalMinutes: 12,
};

const MS_PER_MINUTE = 60_000;

export function getTicketUrgency(
  elapsedMs: number,
  thresholds: TicketThresholds = ticketThresholds,
): TicketUrgency {
  if (elapsedMs >= thresholds.criticalMinutes * MS_PER_MINUTE) return "CRITICAL";
  if (elapsedMs >= thresholds.lateMinutes * MS_PER_MINUTE) return "LATE";
  if (elapsedMs >= thresholds.warningMinutes * MS_PER_MINUTE) return "WARNING";
  return "NORMAL";
}

export function getTicketUrgencyAt(
  ticket: StationTicket,
  now: number,
  thresholds: TicketThresholds = ticketThresholds,
): TicketUrgency {
  return getTicketUrgency(elapsedMsSince(ticket.createdAt, now), thresholds);
}
