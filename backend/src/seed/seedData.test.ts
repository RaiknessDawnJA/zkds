import { describe, expect, it } from "vitest";
import { BAR_ENABLED_CONFIG, DEFAULT_RESTAURANT_CONFIG, type NormalizedOrder } from "@zkds/shared";
import { findDisabledStationReferences, SEED_ORDERS, toNormalizedOrder } from "./seedData";

function order(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    orderNumber: "9999",
    table: "1",
    server: "Sam",
    items: [{ name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" }],
    ...overrides,
  };
}

describe("findDisabledStationReferences", () => {
  it("finds nothing wrong with ordinary BROIL/FRY/SALAD/HOT_SIDE orders under the default config", () => {
    const orders = [
      order({ items: [{ name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" }] }),
      order({ orderNumber: "9998", items: [{ name: "Fries", quantity: 1, modifiers: [], station: "FRY" }] }),
    ];

    expect(findDisabledStationReferences(orders, DEFAULT_RESTAURANT_CONFIG)).toEqual([]);
  });

  it("BAR-enabled config: BAR demo orders (item station + originStation) are accepted", () => {
    const orders = [
      order({
        orderNumber: "1059",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      }),
      order({
        orderNumber: "1063",
        originStation: "BAR",
        items: [
          { name: "Old Fashioned", quantity: 1, modifiers: [], station: "BAR" },
          { name: "6 oz Sirloin", quantity: 1, modifiers: [], station: "BROIL" },
        ],
      }),
    ];

    expect(findDisabledStationReferences(orders, BAR_ENABLED_CONFIG)).toEqual([]);
  });

  it("default no-BAR config: the same BAR item is reported, by name and order number", () => {
    const orders = [
      order({
        orderNumber: "1059",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      }),
    ];

    const problems = findDisabledStationReferences(orders, DEFAULT_RESTAURANT_CONFIG);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("1059");
    expect(problems[0]).toContain("Margarita");
    expect(problems[0]).toContain("BAR");
  });

  it("default no-BAR config: a BAR originStation is reported even if no item targets BAR", () => {
    const orders = [
      order({
        orderNumber: "1063",
        originStation: "BAR",
        items: [{ name: "6 oz Sirloin", quantity: 1, modifiers: [], station: "BROIL" }],
      }),
    ];

    const problems = findDisabledStationReferences(orders, DEFAULT_RESTAURANT_CONFIG);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("1063");
    expect(problems[0]).toContain("originStation");
  });

  it("reports every violation across multiple orders, not just the first", () => {
    const orders = [
      order({
        orderNumber: "1059",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      }),
      order({
        orderNumber: "1063",
        originStation: "BAR",
        items: [{ name: "Old Fashioned", quantity: 1, modifiers: [], station: "BAR" }],
      }),
    ];

    // 1063 has two problems of its own: the item AND the originStation.
    expect(findDisabledStationReferences(orders, DEFAULT_RESTAURANT_CONFIG)).toHaveLength(3);
  });
});

describe("the real demo dataset (SEED_ORDERS) against both configs", () => {
  const realOrders = SEED_ORDERS.map((seedOrder) => toNormalizedOrder(seedOrder, new Date()));

  it("is fully compatible with BAR_ENABLED_CONFIG (== ACTIVE_RESTAURANT_CONFIG today)", () => {
    expect(findDisabledStationReferences(realOrders, BAR_ENABLED_CONFIG)).toEqual([]);
  });

  it("is NOT compatible with DEFAULT_RESTAURANT_CONFIG — the BAR demo orders would be rejected", () => {
    const problems = findDisabledStationReferences(realOrders, DEFAULT_RESTAURANT_CONFIG);

    // This is expected and correct: SEED_ORDERS currently includes the Step
    // 6A BAR scenarios (1059/1061/1063). If this ever starts failing because
    // BAR was removed from SEED_ORDERS, update this test — don't delete it,
    // its job is to make exactly that kind of drift impossible to miss.
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("1059"))).toBe(true);
  });
});
