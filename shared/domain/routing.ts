import type { Order } from "./order";
import type { Station } from "./station";
import type { StationTicket } from "./ticket";

/**
 * The routing engine: splits one Order into one StationTicket per station
 * that actually has items on it, so an order with steaks and fries yields a
 * BROIL ticket and a FRY ticket that are bumped independently. POS-neutral —
 * it only ever looks at `OrderItem.station`, never at where the order came
 * from.
 */
export function routeOrderToStationTickets(order: Order): StationTicket[] {
  const itemsByStation = new Map<Station, Order["items"]>();

  for (const item of order.items) {
    const bucket = itemsByStation.get(item.station);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByStation.set(item.station, [item]);
    }
  }

  return Array.from(itemsByStation, ([station, items]) => ({
    id: `${order.id}-${station}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    table: order.table,
    server: order.server,
    station,
    items,
    status: "ACTIVE" as const,
    // The station's clock starts when its own items were fired, which can lag
    // the order being opened at the table.
    createdAt: earliestSentAt(items) ?? order.createdAt,
  }));
}

export function routeOrdersToStation(
  orders: Order[],
  station: Station,
): StationTicket[] {
  return orders
    .flatMap(routeOrderToStationTickets)
    .filter((ticket) => ticket.station === station);
}

function earliestSentAt(items: Order["items"]): Date | undefined {
  let earliest: Date | undefined;
  for (const item of items) {
    if (!earliest || item.sentAt.getTime() < earliest.getTime()) {
      earliest = item.sentAt;
    }
  }
  return earliest;
}
