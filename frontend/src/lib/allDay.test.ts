import { describe, expect, it } from "vitest";
import { makeItem, makeTicket } from "@/test/factories";
import { calculateAllDay, totalAllDayQuantity } from "./allDay";

describe("calculateAllDay", () => {
  it("sums quantities for the same item across different tickets", () => {
    const tickets = [
      makeTicket({
        id: "t1",
        items: [
          makeItem({ id: "i1", name: "8 oz Sirloin", quantity: 2 }),
          makeItem({ id: "i2", name: "Dallas Filet", quantity: 1 }),
        ],
      }),
      makeTicket({
        id: "t2",
        items: [makeItem({ id: "i3", name: "8 oz Sirloin", quantity: 4 })],
      }),
    ];

    expect(calculateAllDay(tickets)).toEqual([
      { name: "8 oz Sirloin", quantity: 6 },
      { name: "Dallas Filet", quantity: 1 },
    ]);
  });

  it("still counts READY items while their ticket is on the board", () => {
    const tickets = [
      makeTicket({
        id: "t1",
        items: [
          makeItem({
            id: "i1",
            name: "Ribs",
            quantity: 2,
            status: "READY",
          }),
        ],
      }),
    ];

    expect(calculateAllDay(tickets)).toEqual([{ name: "Ribs", quantity: 2 }]);
  });

  it("excludes bumped tickets", () => {
    const tickets = [
      makeTicket({
        id: "t1",
        items: [makeItem({ id: "i1", name: "Ribeye", quantity: 3 })],
      }),
      makeTicket({
        id: "t2",
        status: "BUMPED",
        items: [makeItem({ id: "i2", name: "Ribeye", quantity: 5 })],
      }),
    ];

    expect(calculateAllDay(tickets)).toEqual([{ name: "Ribeye", quantity: 3 }]);
  });

  it("counts recalled tickets again", () => {
    const tickets = [
      makeTicket({
        id: "t1",
        status: "RECALLED",
        items: [makeItem({ id: "i1", name: "Ribeye", quantity: 5 })],
      }),
    ];

    expect(calculateAllDay(tickets)).toEqual([{ name: "Ribeye", quantity: 5 }]);
  });

  it("orders by quantity descending, then name", () => {
    const tickets = [
      makeTicket({
        id: "t1",
        items: [
          makeItem({ id: "i1", name: "Zucchini", quantity: 1 }),
          makeItem({ id: "i2", name: "Apple", quantity: 1 }),
          makeItem({ id: "i3", name: "Ribs", quantity: 9 }),
        ],
      }),
    ];

    expect(calculateAllDay(tickets).map((entry) => entry.name)).toEqual([
      "Ribs",
      "Apple",
      "Zucchini",
    ]);
  });

  it("returns nothing for an empty board", () => {
    expect(calculateAllDay([])).toEqual([]);
  });

  it("Step 7: an active REFIRE ticket contributes +1 to the same-name All Day total", () => {
    const normalTickets = [
      makeTicket({
        id: "t1",
        items: [
          makeItem({ id: "i1", name: "Dallas Filet" }),
          makeItem({ id: "i2", name: "Dallas Filet" }),
          makeItem({ id: "i3", name: "Dallas Filet" }),
          makeItem({ id: "i4", name: "Dallas Filet" }),
          makeItem({ id: "i5", name: "Dallas Filet" }),
          makeItem({ id: "i6", name: "Dallas Filet" }),
        ],
      }),
    ];
    expect(calculateAllDay(normalTickets)).toEqual([{ name: "Dallas Filet", quantity: 6 }]);

    const refireTicket = makeTicket({
      id: "t-refire",
      refire: { originTicketId: "t1", originItemId: "i1" },
      items: [makeItem({ id: "refire-item-1", name: "Dallas Filet" })],
    });

    expect(calculateAllDay([...normalTickets, refireTicket])).toEqual([
      { name: "Dallas Filet", quantity: 7 },
    ]);
  });

  it("Step 7: once the REFIRE ticket is bumped off the active board, All Day drops back to normal", () => {
    const normalTicket = makeTicket({
      id: "t1",
      items: [makeItem({ id: "i1", name: "Dallas Filet" })],
    });
    const bumpedRefire = makeTicket({
      id: "t-refire",
      status: "BUMPED",
      refire: { originTicketId: "t1", originItemId: "i1" },
      items: [makeItem({ id: "refire-item-1", name: "Dallas Filet", status: "READY" })],
    });

    expect(calculateAllDay([normalTicket, bumpedRefire])).toEqual([
      { name: "Dallas Filet", quantity: 1 },
    ]);
  });

  it("sums to the same total whether one line is stacked or expanded into independent quantity-1 items", () => {
    // Step 6C no-stacking invariant: ingestion now always produces
    // independent quantity-1 items, never a single stacked-quantity item.
    // All Day's displayed total must be unaffected by that representation
    // change — four independent items must read exactly like the old
    // single "quantity 4" line used to.
    const stacked = [
      makeTicket({
        id: "t-stacked",
        items: [makeItem({ id: "i1", name: "8 oz Sirloin", quantity: 4 })],
      }),
    ];
    const expanded = [
      makeTicket({
        id: "t-expanded",
        items: [
          makeItem({ id: "i1", name: "8 oz Sirloin", quantity: 1 }),
          makeItem({ id: "i2", name: "8 oz Sirloin", quantity: 1 }),
          makeItem({ id: "i3", name: "8 oz Sirloin", quantity: 1 }),
          makeItem({ id: "i4", name: "8 oz Sirloin", quantity: 1 }),
        ],
      }),
    ];

    expect(calculateAllDay(expanded)).toEqual(calculateAllDay(stacked));
    expect(calculateAllDay(expanded)).toEqual([{ name: "8 oz Sirloin", quantity: 4 }]);
  });
});

describe("totalAllDayQuantity", () => {
  it("adds up every entry", () => {
    expect(
      totalAllDayQuantity([
        { name: "Sirloin", quantity: 7 },
        { name: "Ribs", quantity: 2 },
      ]),
    ).toBe(9);
  });
});
