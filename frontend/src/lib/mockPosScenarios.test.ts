import { describe, expect, it } from "vitest";
import { generateMockOrderNumber, MOCK_POS_SCENARIOS } from "./mockPosScenarios";

function findScenario(id: string) {
  const scenario = MOCK_POS_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`No scenario "${id}" — test setup is wrong`);
  return scenario;
}

describe("generateMockOrderNumber", () => {
  it("is unique across many rapid calls (Rush-style)", () => {
    const numbers = new Set(Array.from({ length: 500 }, () => generateMockOrderNumber()));
    expect(numbers.size).toBe(500);
  });
});

describe("MockOrderScenario.buildOrder", () => {
  it("produces a fresh object with a unique orderNumber on every call", () => {
    const scenario = findScenario("broil-only");
    const a = scenario.buildOrder();
    const b = scenario.buildOrder();

    expect(a).not.toBe(b);
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });

  it("stamps createdAt as current on every call", () => {
    const scenario = findScenario("broil-only");
    const before = Date.now();
    const order = scenario.buildOrder();
    const after = Date.now();

    expect(order.createdAt).toBeDefined();
    const createdAt = order.createdAt!.getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it("broil-only posts a single BROIL item and no other station", () => {
    const order = findScenario("broil-only").buildOrder();

    expect(order.items).toHaveLength(1);
    expect(order.items[0].station).toBe("BROIL");
    expect(order.originStation).toBeUndefined();
  });

  it("mixed-food-bar includes BAR alongside food stations", () => {
    const order = findScenario("mixed-food-bar").buildOrder();

    const stations = order.items.map((item) => item.station);
    expect(stations).toContain("BAR");
    expect(stations).toContain("BROIL");
    expect(stations).toContain("FRY");
    expect(order.originStation).toBeUndefined();
  });

  it("bar-origin sets originStation: BAR and still routes a food item", () => {
    const order = findScenario("bar-origin").buildOrder();

    expect(order.originStation).toBe("BAR");
    expect(order.items.some((item) => item.station === "BAR")).toBe(true);
    expect(order.items.some((item) => item.station !== "BAR")).toBe(true);
  });

  it("bar-origin-drinks-only sets originStation: BAR with every item also on BAR (fully suppressible)", () => {
    const order = findScenario("bar-origin-drinks-only").buildOrder();

    expect(order.originStation).toBe("BAR");
    expect(order.items.every((item) => item.station === "BAR")).toBe(true);
  });

  it("every scenario has at least one item and a non-empty label/description", () => {
    for (const scenario of MOCK_POS_SCENARIOS) {
      const order = scenario.buildOrder();
      expect(order.items.length).toBeGreaterThan(0);
      expect(scenario.label.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(0);
      expect(scenario.stationsInvolved.length).toBeGreaterThan(0);
    }
  });
});
