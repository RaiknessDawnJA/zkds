import { isOnActiveBoard, type StationTicket } from "@zkds/shared";

export interface AllDayEntry {
  name: string;
  quantity: number;
}

/**
 * "All day" = everything the station still owes, regardless of how many tickets
 * it is spread across.
 *
 * Counts are grouped by exact menu item name rather than a coarser category,
 * because a 6 oz and an 8 oz sirloin are different cooks — the cook needs the
 * number they actually have to fire. READY lines still count until the ticket
 * itself is bumped; bumped tickets drop out entirely.
 */
export function calculateAllDay(tickets: StationTicket[]): AllDayEntry[] {
  const totals = new Map<string, number>();

  for (const ticket of tickets) {
    if (!isOnActiveBoard(ticket)) continue;
    for (const item of ticket.items) {
      totals.set(item.name, (totals.get(item.name) ?? 0) + item.quantity);
    }
  }

  return Array.from(totals, ([name, quantity]) => ({ name, quantity })).sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name),
  );
}

export function totalAllDayQuantity(entries: AllDayEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
