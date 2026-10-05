import type {
  ItemStatus,
  OrderItem,
  StationTicket,
  StationTicketStatus,
} from "@zkds/shared";

/** Fixed base time so every test reads as an absolute, obvious timeline. */
export const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");

export function makeItem(
  overrides: Partial<OrderItem> & Pick<OrderItem, "id" | "name">,
): OrderItem {
  return {
    quantity: 1,
    modifiers: [],
    station: "BROIL",
    status: "PENDING" as ItemStatus,
    sentAt: BASE_TIME,
    ...overrides,
  };
}

export function makeTicket(
  overrides: Partial<StationTicket> & Pick<StationTicket, "id">,
): StationTicket {
  return {
    orderId: `order-${overrides.id}`,
    orderNumber: "1000",
    table: "1",
    server: "Sam",
    station: "BROIL",
    items: [],
    status: "ACTIVE" as StationTicketStatus,
    createdAt: BASE_TIME,
    ...overrides,
  };
}
