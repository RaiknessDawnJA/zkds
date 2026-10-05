import { describe, expect, it } from "vitest";
import type { Order, OrderItem } from "./order";
import { routeOrderToStationTickets, routeOrdersToStation } from "./routing";

/** Ported from frontend/src/domain/routing.test.ts (Step 1). */

const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");

function makeItem(
  overrides: Partial<OrderItem> & Pick<OrderItem, "id" | "name">,
): OrderItem {
  return {
    quantity: 1,
    modifiers: [],
    station: "BROIL",
    status: "PENDING",
    sentAt: BASE_TIME,
    ...overrides,
  };
}

const order: Order = {
  id: "order-1048",
  orderNumber: "1048",
  table: "18",
  server: "Maria",
  createdAt: BASE_TIME,
  items: [
    makeItem({ id: "i1", name: "8 oz Sirloin", quantity: 2, station: "BROIL" }),
    makeItem({ id: "i2", name: "Steak Fries", station: "HOT_SIDE" }),
    makeItem({ id: "i3", name: "Ft. Worth Ribeye", station: "BROIL" }),
  ],
};

describe("routeOrderToStationTickets", () => {
  it("splits one order into one ticket per station that has work", () => {
    const tickets = routeOrderToStationTickets(order);

    expect(tickets).toHaveLength(2);
    expect(tickets.map((t) => t.station)).toEqual(["BROIL", "HOT_SIDE"]);
  });

  it("gives each ticket only its own station's items", () => {
    const [broil, hotSide] = routeOrderToStationTickets(order);

    expect(broil.items.map((i) => i.id)).toEqual(["i1", "i3"]);
    expect(hotSide.items.map((i) => i.id)).toEqual(["i2"]);
  });

  it("carries the order identity onto every ticket without merging them", () => {
    const tickets = routeOrderToStationTickets(order);

    for (const ticket of tickets) {
      expect(ticket.orderId).toBe("order-1048");
      expect(ticket.orderNumber).toBe("1048");
      expect(ticket.table).toBe("18");
      expect(ticket.server).toBe("Maria");
      expect(ticket.status).toBe("ACTIVE");
    }
    // Distinct tickets, so each station bumps independently.
    expect(tickets[0].id).not.toBe(tickets[1].id);
  });

  it("starts the ticket clock at the earliest item send time", () => {
    const late = new Date(BASE_TIME.getTime() + 120_000);
    const tickets = routeOrderToStationTickets({
      ...order,
      items: [
        makeItem({ id: "a", name: "Ribs", station: "BROIL", sentAt: late }),
        makeItem({
          id: "b",
          name: "Dallas Filet",
          station: "BROIL",
          sentAt: BASE_TIME,
        }),
      ],
    });

    expect(tickets[0].createdAt).toEqual(BASE_TIME);
  });
});

describe("routeOrderToStationTickets — no-stacking invariant (Step 6C)", () => {
  it("routes multiple independent same-name, same-station items into one ticket without merging them", () => {
    // Shape ingestion now produces after expanding a "quantity: 4" line —
    // four distinct items, same name/modifiers/station, never merged back
    // into one stacked entry by routing.
    const expandedOrder: Order = {
      id: "order-1053",
      orderNumber: "1053",
      table: "30",
      server: "Priya",
      createdAt: BASE_TIME,
      items: [
        makeItem({ id: "sirloin-1", name: "8 oz Sirloin", quantity: 1, station: "BROIL" }),
        makeItem({ id: "sirloin-2", name: "8 oz Sirloin", quantity: 1, station: "BROIL" }),
        makeItem({ id: "sirloin-3", name: "8 oz Sirloin", quantity: 1, station: "BROIL" }),
        makeItem({ id: "sirloin-4", name: "8 oz Sirloin", quantity: 1, station: "BROIL" }),
      ],
    };

    const tickets = routeOrderToStationTickets(expandedOrder);

    expect(tickets).toHaveLength(1);
    expect(tickets[0].items).toHaveLength(4);
    expect(tickets[0].items.map((i) => i.id)).toEqual([
      "sirloin-1",
      "sirloin-2",
      "sirloin-3",
      "sirloin-4",
    ]);
    expect(tickets[0].items.every((i) => i.quantity === 1)).toBe(true);
    expect(new Set(tickets[0].items.map((i) => i.id)).size).toBe(4);
  });
});

describe("routeOrdersToStation", () => {
  it("returns only the requested station's tickets", () => {
    const tickets = routeOrdersToStation([order], "BROIL");

    expect(tickets).toHaveLength(1);
    expect(tickets[0].station).toBe("BROIL");
    expect(tickets[0].items).toHaveLength(2);
  });

  it("returns nothing for a station with no items", () => {
    expect(routeOrdersToStation([order], "WINDOW")).toEqual([]);
  });
});
