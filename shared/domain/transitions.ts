import type { ExpoOrderState } from "./expo";
import type { ItemStatus, OrderItem } from "./order";
import {
  areAllStationTicketsBumpedForOrder,
  isOnActiveBoard,
  type StationTicket,
} from "./ticket";

/**
 * The pure domain transitions that used to live as `stationReducer` case
 * bodies in the frontend. Extracted here, unchanged in behavior, so the
 * backend can be the one authority applying them — no `useReducer`/action-type
 * wrapper needed server-side, since an HTTP route already knows exactly which
 * transition it wants; it calls the function directly.
 *
 * Each function returns the SAME ticket/state reference when nothing actually
 * changed (e.g. bumping an already-bumped ticket), so a caller can cheaply
 * tell "was this a no-op" via reference equality before deciding whether to
 * write to the database or broadcast an event.
 */

export function applyCompleteItem(
  ticket: StationTicket,
  itemId: string,
  at: Date,
): StationTicket {
  return setItemStatus(ticket, itemId, "READY", at);
}

export function applyUncompleteItem(
  ticket: StationTicket,
  itemId: string,
): StationTicket {
  return setItemStatus(ticket, itemId, "PENDING");
}

/** Bumping means "this station is done with its part". Never removes the
 *  ticket or its items — the recall view reads the exact same objects. */
export function applyBumpTicket(ticket: StationTicket, at: Date): StationTicket {
  return isOnActiveBoard(ticket)
    ? { ...ticket, status: "BUMPED", bumpedAt: at }
    : ticket;
}

/** The ticket goes back on the board but keeps RECALLED (and both
 *  timestamps) so the screen can show that it came back. */
export function applyRecallTicket(ticket: StationTicket, at: Date): StationTicket {
  return ticket.status === "BUMPED"
    ? { ...ticket, status: "RECALLED", recalledAt: at }
    : ticket;
}

/**
 * Expo dispatching an order never touches a StationTicket — it only produces
 * Expo's own lifecycle record for that orderId. Returns null (not the
 * previous state) when the order isn't actually eligible, so a caller can
 * distinguish "no-op, already bumped" from "rejected, not ready" if it needs
 * to — the backend uses this to return a 409 rather than silently no-op.
 */
export function applyBumpExpoOrder(
  allTickets: StationTicket[],
  orderId: string,
  current: ExpoOrderState | undefined,
  at: Date,
): ExpoOrderState | null {
  if (!areAllStationTicketsBumpedForOrder(allTickets, orderId)) return null;
  return { status: "BUMPED", bumpedAt: at, recalledAt: current?.recalledAt };
}

/** Puts the order back on Expo's active board only — station tickets are
 *  never touched here, by design. */
export function applyRecallExpoOrder(
  current: ExpoOrderState | undefined,
  at: Date,
): ExpoOrderState | null {
  if (!current || current.status !== "BUMPED") return null;
  return { ...current, status: "RECALLED", recalledAt: at };
}

function setItemStatus(
  ticket: StationTicket,
  itemId: string,
  nextStatus: ItemStatus,
  at?: Date,
): StationTicket {
  // Completion is only meaningful while the station still owns the ticket.
  if (!isOnActiveBoard(ticket)) return ticket;

  let changed = false;
  const items = ticket.items.map((item) => {
    if (item.id !== itemId || item.status === nextStatus) return item;
    changed = true;
    return nextStatus === "READY"
      ? { ...item, status: nextStatus, completedAt: at }
      : clearCompletion(item);
  });

  return changed ? { ...ticket, items } : ticket;
}

function clearCompletion(item: OrderItem): OrderItem {
  const next: OrderItem = { ...item, status: "PENDING" };
  delete next.completedAt;
  return next;
}
