import { randomUUID } from "node:crypto";
import {
  routeOrderToStationTickets,
  type NormalizedOrder,
  type Order,
  type OrderItem,
  type StationTicket,
} from "@zkds/shared";
import { db } from "../db/client";
import { orderItems, orders, stationTickets } from "../db/schema";

/**
 * The one POS-neutral order-ingestion boundary. Every order source — the
 * dev seed script today, a future Mock POS, standalone mode, or a Square/
 * Toast/Aloha adapter — normalizes into a `NormalizedOrder` and calls this.
 * Nothing vendor-specific exists anywhere near it.
 *
 * Reuses `routeOrderToStationTickets` unchanged: it builds the same
 * in-memory `Order` -> `StationTicket[]` shape the frontend always has, then
 * just persists what routing already decided — no parallel grouping logic.
 * `routeOrderToStationTickets` itself never learns about `originStation` —
 * suppression happens here, before routing ever sees the excluded items, so
 * routing stays exactly as simple/POS-neutral as it's always been.
 */
export async function createOrder(normalized: NormalizedOrder): Promise<StationTicket[]> {
  const createdAt = normalized.createdAt ?? new Date();
  const orderId = randomUUID();

  const routableItems = normalized.items.filter(
    (item) => item.station !== normalized.originStation,
  );

  const order: Order = {
    id: orderId,
    orderNumber: normalized.orderNumber,
    table: normalized.table,
    server: normalized.server,
    createdAt,
    // No-stacking invariant: every internal/persisted OrderItem is exactly
    // one physical unit of work. A NormalizedOrderItem's quantity is a
    // POS-side aggregation convenience only — ingestion is the one place
    // that expands it, so a "Sirloin x4" line becomes four independent
    // items, each individually completable/refireable, before routing ever
    // sees them. Routing itself stays quantity-unaware.
    items: routableItems.flatMap((item): OrderItem[] =>
      Array.from({ length: item.quantity }, (): OrderItem => ({
        id: randomUUID(),
        name: item.name,
        quantity: 1,
        modifiers: item.modifiers,
        station: item.station,
        status: "PENDING",
        sentAt: createdAt,
      })),
    ),
  };

  const tickets = routeOrderToStationTickets(order);

  if (tickets.length === 0) {
    // Nothing to route — e.g. every item was suppressed because this order
    // originated at its own station (a bar-seated guest's drinks). A
    // legitimate outcome, not an error: don't persist an orders row nothing
    // will ever reference.
    return [];
  }

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: order.id,
      orderNumber: order.orderNumber,
      tableName: order.table,
      serverName: order.server,
      createdAt: order.createdAt,
    });

    for (const ticket of tickets) {
      await tx.insert(stationTickets).values({
        id: ticket.id,
        orderId: ticket.orderId,
        station: ticket.station,
        status: ticket.status,
        createdAt: ticket.createdAt,
      });

      await tx.insert(orderItems).values(
        ticket.items.map((item) => ({
          id: item.id,
          orderId: order.id,
          stationTicketId: ticket.id,
          name: item.name,
          quantity: item.quantity,
          modifiers: item.modifiers,
          station: item.station,
          status: item.status,
          sentAt: item.sentAt,
        })),
      );
    }
  });

  return tickets;
}
