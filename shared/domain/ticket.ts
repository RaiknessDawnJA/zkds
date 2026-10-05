import type { OrderItem } from "./order";
import type { Station } from "./station";

export type StationTicketStatus = "ACTIVE" | "BUMPED" | "RECALLED";

/**
 * Explicit provenance for a REFIRE ticket — never inferred from copied names
 * or order numbers. `originTicketId`/`originItemId` point at the exact
 * source station ticket and item a REFIRE was created from; `orderId` (on
 * the ticket itself) is shared with the origin, since a REFIRE never creates
 * a new order.
 */
export interface RefireProvenance {
  originTicketId: string;
  originItemId: string;
}

/**
 * The slice of an Order that one station is responsible for.
 *
 * A StationTicket is deliberately NOT the same object as the Order: one order
 * produces one ticket per station that has work on it, and each station bumps
 * its own ticket without touching the others.
 */
export interface StationTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  table: string;
  server: string;
  station: Station;
  items: OrderItem[];
  status: StationTicketStatus;
  /** Kitchen-send time for this station's work. Source of truth for the timer. */
  createdAt: Date;
  bumpedAt?: Date;
  recalledAt?: Date;
  /**
   * Present only on a REFIRE ticket — undefined for every normal station
   * ticket. A REFIRE ticket is otherwise a completely ordinary StationTicket
   * (exactly one item, its own independent lifecycle), which is what lets
   * every existing generic station/board component keep working unchanged.
   */
  refire?: RefireProvenance;
}

/**
 * Tickets the cook still has to work: freshly fired ones and recalled ones.
 *
 * A recalled ticket keeps the RECALLED status so the screen can flag that it
 * came back, but for every queue/count purpose it behaves as active again.
 */
export function isOnActiveBoard(ticket: StationTicket): boolean {
  return ticket.status === "ACTIVE" || ticket.status === "RECALLED";
}

export function isBumped(ticket: StationTicket): boolean {
  return ticket.status === "BUMPED";
}

export function wasRecalled(ticket: StationTicket): boolean {
  return ticket.recalledAt !== undefined;
}

export function areAllItemsReady(ticket: StationTicket): boolean {
  return ticket.items.every((item) => item.status === "READY");
}

export function countPendingItems(ticket: StationTicket): number {
  return ticket.items.filter((item) => item.status === "PENDING").length;
}

/** True only for a REFIRE ticket — undefined `refire` means an ordinary
 *  station ticket. This is the single source of truth every REFIRE-aware
 *  filter/comparator checks, rather than each reimplementing the check. */
export function isRefireTicket(ticket: StationTicket): boolean {
  return ticket.refire !== undefined;
}

/** Oldest ticket first — the order a cook works the board in. */
export function byOldestFirst(a: StationTicket, b: StationTicket): number {
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * REFIRE tickets always sort before normal tickets, regardless of age — a
 * REFIRE is operationally urgent from the moment it's created, so a 5-second-
 * old REFIRE still outranks a 14-minute CRITICAL normal ticket. Within each
 * group, oldest-first is preserved (REFIRE included: the longest-outstanding
 * REFIRE shouldn't be visually buried by a newer one). Intended for the
 * ACTIVE board only — the Recall tab keeps `byMostRecentlyBumpedFirst`.
 */
export function byBoardPriority(a: StationTicket, b: StationTicket): number {
  const aRefire = isRefireTicket(a) ? 1 : 0;
  const bRefire = isRefireTicket(b) ? 1 : 0;
  if (aRefire !== bRefire) return bRefire - aRefire;
  return byOldestFirst(a, b);
}

/** Most recently bumped first — the order the recall list is most useful in. */
export function byMostRecentlyBumpedFirst(
  a: StationTicket,
  b: StationTicket,
): number {
  return (b.bumpedAt?.getTime() ?? 0) - (a.bumpedAt?.getTime() ?? 0);
}

/**
 * Whether every station ticket belonging to an order has been bumped. This is
 * what makes an order eligible for Window's own bump — Window never overrides
 * or reads a separate readiness flag, it just checks the real ticket states.
 */
export function areAllStationTicketsBumpedForOrder(
  tickets: StationTicket[],
  orderId: string,
): boolean {
  const orderTickets = tickets.filter((ticket) => ticket.orderId === orderId);
  return orderTickets.length > 0 && orderTickets.every(isBumped);
}
