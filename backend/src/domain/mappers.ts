import type { ExpoOrderState, OrderItem, StationTicket } from "@zkds/shared";
import type {
  orderItems,
  orders,
  stationTickets,
  expoOrders,
  refireTickets,
} from "../db/schema";

type OrderRow = typeof orders.$inferSelect;
type StationTicketRow = typeof stationTickets.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;
type ExpoOrderRow = typeof expoOrders.$inferSelect;
type RefireTicketRow = typeof refireTickets.$inferSelect;

export function rowToOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    modifiers: row.modifiers,
    station: row.station,
    status: row.status,
    sentAt: row.sentAt,
    completedAt: row.completedAt ?? undefined,
  };
}

export function rowToStationTicket(
  row: StationTicketRow & { items: OrderItemRow[]; order: OrderRow },
): StationTicket {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    table: row.order.tableName,
    server: row.order.serverName,
    station: row.station,
    items: row.items.map(rowToOrderItem),
    status: row.status,
    createdAt: row.createdAt,
    bumpedAt: row.bumpedAt ?? undefined,
    recalledAt: row.recalledAt ?? undefined,
  };
}

/**
 * Projects a refire_tickets row (+ its order relation, for orderNumber/
 * table/server — the same pattern rowToStationTicket already uses) into the
 * ordinary StationTicket shape, with exactly one synthesized item. This is
 * what lets every existing generic station/board component keep working
 * unchanged: to the frontend, a REFIRE ticket is just a StationTicket whose
 * `refire` field happens to be populated.
 */
export function rowToRefireStationTicket(
  row: RefireTicketRow & { order: OrderRow },
): StationTicket {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    table: row.order.tableName,
    server: row.order.serverName,
    station: row.station,
    items: [
      {
        id: row.itemId,
        name: row.name,
        quantity: 1,
        modifiers: row.modifiers,
        station: row.station,
        status: row.itemStatus,
        sentAt: row.createdAt,
        completedAt: row.itemCompletedAt ?? undefined,
      },
    ],
    status: row.status,
    createdAt: row.createdAt,
    bumpedAt: row.bumpedAt ?? undefined,
    recalledAt: row.recalledAt ?? undefined,
    refire: {
      originTicketId: row.originTicketId,
      originItemId: row.originItemId,
    },
  };
}

export function rowToExpoOrderState(row: ExpoOrderRow): ExpoOrderState {
  return {
    status: row.status,
    bumpedAt: row.bumpedAt ?? undefined,
    recalledAt: row.recalledAt ?? undefined,
  };
}
