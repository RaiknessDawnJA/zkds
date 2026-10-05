import { describe, expect, it } from "vitest";
import type { ItemStatus, OrderItem } from "./order";
import type { ExpoOrderState } from "./expo";
import type { StationTicket, StationTicketStatus } from "./ticket";
import {
  applyBumpExpoOrder,
  applyBumpTicket,
  applyCompleteItem,
  applyRecallExpoOrder,
  applyRecallTicket,
  applyUncompleteItem,
} from "./transitions";

/**
 * Ported from frontend/src/state/stationReducer.test.ts (Steps 1-4). Same
 * assertions, new home: these pure transitions used to be reducer case
 * bodies and are now the backend's authoritative domain logic (Step 5).
 */

const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");
const COMPLETED_AT = new Date("2026-01-01T18:03:00.000Z");
const BUMPED_AT = new Date("2026-01-01T18:05:00.000Z");
const RECALLED_AT = new Date("2026-01-01T18:07:00.000Z");

function makeItem(
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

function makeTicket(
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

const broilTicket = () =>
  makeTicket({
    id: "broil-1",
    orderId: "order-1048",
    orderNumber: "1048",
    items: [
      makeItem({ id: "i1", name: "8 oz Sirloin", quantity: 2 }),
      makeItem({ id: "i2", name: "Ft. Worth Ribeye" }),
    ],
  });

describe("item completion", () => {
  it("marks an item READY and stamps completedAt", () => {
    const next = applyCompleteItem(broilTicket(), "i1", COMPLETED_AT);

    expect(next.items[0].status).toBe("READY");
    expect(next.items[0].completedAt).toEqual(COMPLETED_AT);
    expect(next.items[1].status).toBe("PENDING");
  });

  it("undoes completion and clears completedAt", () => {
    const completed = applyCompleteItem(broilTicket(), "i1", COMPLETED_AT);
    const next = applyUncompleteItem(completed, "i1");

    expect(next.items[0].status).toBe("PENDING");
    expect(next.items[0].completedAt).toBeUndefined();
    expect("completedAt" in next.items[0]).toBe(false);
  });

  it("keeps completed items on the ticket", () => {
    const next = applyCompleteItem(broilTicket(), "i1", COMPLETED_AT);
    expect(next.items).toHaveLength(2);
  });

  it("does not change item state on a bumped ticket", () => {
    const ticket = makeTicket({
      id: "broil-1",
      status: "BUMPED",
      bumpedAt: BUMPED_AT,
      items: [makeItem({ id: "i1", name: "Ribs" })],
    });

    expect(applyCompleteItem(ticket, "i1", COMPLETED_AT)).toBe(ticket);
  });

  it("leaves the ticket untouched for an unknown item", () => {
    const ticket = broilTicket();
    expect(applyCompleteItem(ticket, "nope", COMPLETED_AT)).toBe(ticket);
  });
});

describe("bump", () => {
  it("marks the ticket BUMPED and stamps bumpedAt", () => {
    const next = applyBumpTicket(broilTicket(), BUMPED_AT);
    expect(next.status).toBe("BUMPED");
    expect(next.bumpedAt).toEqual(BUMPED_AT);
  });

  it("bumps with pending items still on the ticket", () => {
    const next = applyBumpTicket(broilTicket(), BUMPED_AT);
    expect(next.status).toBe("BUMPED");
    expect(next.items.every((i) => i.status === "PENDING")).toBe(true);
  });

  it("does not delete the ticket or its items", () => {
    const next = applyBumpTicket(broilTicket(), BUMPED_AT);
    expect(next.items).toHaveLength(2);
    expect(next.createdAt).toEqual(BASE_TIME);
  });

  it("only affects the targeted ticket, not a sibling ticket for the same order", () => {
    const broil = broilTicket();
    const fry = makeTicket({ id: "fry-1", station: "FRY", orderId: "order-1048" });

    const next = applyBumpTicket(broil, BUMPED_AT);

    expect(next.status).toBe("BUMPED");
    expect(fry.status).toBe("ACTIVE"); // untouched — a different function call entirely
  });
});

describe("recall", () => {
  it("returns a bumped ticket to the board and stamps recalledAt", () => {
    const bumped = applyBumpTicket(broilTicket(), BUMPED_AT);
    const next = applyRecallTicket(bumped, RECALLED_AT);

    expect(next.status).toBe("RECALLED");
    expect(next.recalledAt).toEqual(RECALLED_AT);
    expect(next.bumpedAt).toEqual(BUMPED_AT);
  });

  it("ignores recall for a ticket that is not bumped", () => {
    const ticket = broilTicket();
    expect(applyRecallTicket(ticket, RECALLED_AT)).toBe(ticket);
  });

  it("allows a recalled ticket to be bumped again", () => {
    const rebumpedAt = new Date("2026-01-01T18:12:00.000Z");

    let ticket = applyBumpTicket(broilTicket(), BUMPED_AT);
    ticket = applyRecallTicket(ticket, RECALLED_AT);
    ticket = applyBumpTicket(ticket, rebumpedAt);

    expect(ticket.status).toBe("BUMPED");
    expect(ticket.bumpedAt).toEqual(rebumpedAt);
    expect(ticket.recalledAt).toEqual(RECALLED_AT);
  });

  it("lets items be completed again after a recall", () => {
    let ticket = applyBumpTicket(broilTicket(), BUMPED_AT);
    ticket = applyRecallTicket(ticket, RECALLED_AT);
    ticket = applyCompleteItem(ticket, "i1", COMPLETED_AT);

    expect(ticket.items[0].status).toBe("READY");
  });

  it("does not accumulate duplicate items or grow across many bump/recall cycles", () => {
    let ticket = broilTicket();
    const originalItemCount = ticket.items.length;

    for (let cycle = 0; cycle < 25; cycle++) {
      ticket = applyBumpTicket(ticket, new Date(BUMPED_AT.getTime() + cycle * 60_000));
      ticket = applyRecallTicket(ticket, new Date(RECALLED_AT.getTime() + cycle * 60_000));
    }

    expect(ticket.items).toHaveLength(originalItemCount);
    expect(ticket.id).toBe("broil-1");
  });
});

describe("Window bump/recall (Expo order lifecycle)", () => {
  const twoStationTickets = (): StationTicket[] => [
    makeTicket({
      id: "1048-BROIL",
      orderId: "order-1048",
      orderNumber: "1048",
      station: "BROIL",
      status: "BUMPED",
      bumpedAt: BUMPED_AT,
      items: [makeItem({ id: "i1", name: "Ribeye" })],
    }),
    makeTicket({
      id: "1048-FRY",
      orderId: "order-1048",
      orderNumber: "1048",
      station: "FRY",
      status: "ACTIVE",
      items: [makeItem({ id: "i2", name: "Fries", station: "FRY" })],
    }),
  ];

  it("refuses to bump an order while any station ticket is still not bumped", () => {
    const tickets = twoStationTickets(); // FRY still ACTIVE
    expect(applyBumpExpoOrder(tickets, "order-1048", undefined, BUMPED_AT)).toBeNull();
  });

  it("bumps an order once every station ticket is bumped", () => {
    const tickets = twoStationTickets();
    tickets[1] = { ...tickets[1], status: "BUMPED", bumpedAt: BUMPED_AT };

    const next = applyBumpExpoOrder(tickets, "order-1048", undefined, BUMPED_AT);

    expect(next).toEqual({ status: "BUMPED", bumpedAt: BUMPED_AT, recalledAt: undefined });
  });

  it("recalling a Window-bumped order produces RECALLED without touching station tickets", () => {
    const bumped: ExpoOrderState = { status: "BUMPED", bumpedAt: BUMPED_AT };
    const next = applyRecallExpoOrder(bumped, RECALLED_AT);

    expect(next).toEqual({ status: "RECALLED", bumpedAt: BUMPED_AT, recalledAt: RECALLED_AT });
    // This function never receives or returns StationTicket data at all —
    // structurally incapable of reopening a station.
  });

  it("ignores Window recall for an order that was never Window-bumped", () => {
    expect(applyRecallExpoOrder(undefined, RECALLED_AT)).toBeNull();
  });

  it("only computes state for the order it's asked about", () => {
    const tickets = [
      ...twoStationTickets(),
      makeTicket({
        id: "1055-BROIL",
        orderId: "order-1055",
        orderNumber: "1055",
        station: "BROIL",
        status: "BUMPED",
        bumpedAt: BUMPED_AT,
        items: [makeItem({ id: "i3", name: "Filet" })],
      }),
    ];
    tickets[1] = { ...tickets[1], status: "BUMPED", bumpedAt: BUMPED_AT };

    // Bumping order-1048 says nothing about order-1055 — a caller must ask separately.
    const result = applyBumpExpoOrder(tickets, "order-1048", undefined, BUMPED_AT);
    expect(result?.status).toBe("BUMPED");
  });
});
