import { describe, expect, it } from "vitest";
import type { OrderSummary, StationProgress } from "./orderSummary";
import {
  buildExpoOrders,
  MAX_WINDOW_RECALL_ORDERS,
  selectActiveExpoOrders,
  selectRecallExpoOrders,
} from "./expoOrders";

const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");

function makeStation(overrides: Partial<StationProgress> = {}): StationProgress {
  return {
    station: "BROIL",
    ticketId: "t1",
    items: [],
    ready: true,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    orderId: "order-1",
    orderNumber: "1000",
    table: "1",
    server: "Sam",
    createdAt: BASE_TIME,
    stations: [makeStation()],
    waitingOn: [],
    ...overrides,
  };
}

describe("buildExpoOrders", () => {
  it("defaults to ACTIVE for an order with no expo state yet", () => {
    const [order] = buildExpoOrders([makeSummary()], {});
    expect(order.expoStatus).toBe("ACTIVE");
    expect(order.expoBumpedAt).toBeUndefined();
  });

  it("carries the expo state that exists for an order", () => {
    const bumpedAt = new Date(BASE_TIME.getTime() + 60_000);
    const [order] = buildExpoOrders(
      [makeSummary()],
      { "order-1": { status: "BUMPED", bumpedAt } },
    );
    expect(order.expoStatus).toBe("BUMPED");
    expect(order.expoBumpedAt).toEqual(bumpedAt);
  });

  it("derives readyForBump from waitingOn rather than storing it separately", () => {
    const [ready] = buildExpoOrders([makeSummary({ waitingOn: [] })], {});
    const [notReady] = buildExpoOrders(
      [makeSummary({ orderId: "order-2", waitingOn: ["FRY"] })],
      {},
    );
    expect(ready.readyForBump).toBe(true);
    expect(notReady.readyForBump).toBe(false);
  });
});

describe("selectActiveExpoOrders", () => {
  it("includes ACTIVE and RECALLED, excludes BUMPED", () => {
    const orders = buildExpoOrders(
      [
        makeSummary({ orderId: "a" }),
        makeSummary({ orderId: "b" }),
        makeSummary({ orderId: "c" }),
      ],
      {
        b: { status: "BUMPED", bumpedAt: BASE_TIME },
        c: { status: "RECALLED", bumpedAt: BASE_TIME, recalledAt: BASE_TIME },
      },
    );

    expect(selectActiveExpoOrders(orders).map((o) => o.orderId)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("selectRecallExpoOrders", () => {
  it("includes only BUMPED, most recently bumped first", () => {
    const older = new Date(BASE_TIME.getTime() - 60_000);
    const orders = buildExpoOrders(
      [
        makeSummary({ orderId: "a" }),
        makeSummary({ orderId: "b" }),
        makeSummary({ orderId: "c" }),
      ],
      {
        a: { status: "BUMPED", bumpedAt: older },
        b: { status: "BUMPED", bumpedAt: BASE_TIME },
      },
    );

    expect(selectRecallExpoOrders(orders).map((o) => o.orderId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("caps the list at MAX_WINDOW_RECALL_ORDERS without deleting anything from the input", () => {
    const summaries: OrderSummary[] = [];
    const expoState: Record<string, { status: "BUMPED"; bumpedAt: Date }> = {};

    for (let i = 0; i < MAX_WINDOW_RECALL_ORDERS + 10; i++) {
      const orderId = `order-${i}`;
      summaries.push(makeSummary({ orderId, orderNumber: String(i) }));
      expoState[orderId] = {
        status: "BUMPED",
        bumpedAt: new Date(BASE_TIME.getTime() + i * 1000),
      };
    }

    const orders = buildExpoOrders(summaries, expoState);
    expect(orders).toHaveLength(MAX_WINDOW_RECALL_ORDERS + 10); // input untouched

    const recallList = selectRecallExpoOrders(orders);
    expect(recallList).toHaveLength(MAX_WINDOW_RECALL_ORDERS);
    // Most recently bumped survive the cap.
    expect(recallList[0].orderNumber).toBe(String(MAX_WINDOW_RECALL_ORDERS + 9));
  });
});
