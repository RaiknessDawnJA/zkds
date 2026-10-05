import type { ExpoOrderState, StationTicket } from "@zkds/shared";
import { db } from "../db/client";
import { expoOrders } from "../db/schema";
import { rowToExpoOrderState, rowToRefireStationTicket, rowToStationTicket } from "./mappers";

export interface KitchenSnapshot {
  tickets: StationTicket[];
  expoOrders: Record<string, ExpoOrderState>;
}

/**
 * Everything a freshly-connecting client needs — the exact same
 * `{ tickets, expoOrders }` shape KitchenStateContext already exposed when
 * state lived in a local reducer. A client filters `tickets` by station
 * itself, same as today. REFIRE tickets are loaded from their own table and
 * merged into the same `tickets` array, projected into the ordinary
 * StationTicket shape — a client never needs to know they came from a
 * different table.
 */
export async function loadSnapshot(): Promise<KitchenSnapshot> {
  const ticketRows = await db.query.stationTickets.findMany({
    with: { items: true, order: true },
  });
  const refireRows = await db.query.refireTickets.findMany({
    with: { order: true },
  });
  const tickets = [
    ...ticketRows.map(rowToStationTicket),
    ...refireRows.map(rowToRefireStationTicket),
  ];

  const expoRows = await db.select().from(expoOrders);
  const expoOrderState: Record<string, ExpoOrderState> = {};
  for (const row of expoRows) {
    expoOrderState[row.orderId] = rowToExpoOrderState(row);
  }

  return { tickets, expoOrders: expoOrderState };
}
