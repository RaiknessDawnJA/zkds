import type { NormalizedOrder, NormalizedOrderItem, ProductionStation } from "@zkds/shared";

/**
 * A reusable order template for the Mock POS scenario launcher. `buildOrder`
 * is a factory, not a static object — every call constructs a brand-new
 * `NormalizedOrder` with its own id and timestamp, so nothing is ever shared
 * or mutated between clicks. This is the ONLY thing the launcher UI touches;
 * it posts whatever `buildOrder()` returns through the real ingestion API
 * (`postNormalizedOrder` in `apiClient.ts`) exactly like any other caller.
 */
export interface MockOrderScenario {
  id: string;
  label: string;
  description: string;
  /** For the card's "stations involved" badge list — display only, not sent
   *  to the backend. Includes a suppressed origin station where relevant, so
   *  the card can show what the scenario is really about. */
  stationsInvolved: ProductionStation[];
  buildOrder: () => NormalizedOrder;
}

let orderSequence = 0;

/**
 * Centralized, testable order-id generation: a monotonically increasing
 * in-memory sequence combined with the current time, so two clicks in the
 * same millisecond (Rush buttons) still get distinct order numbers, and
 * nothing here can collide with persisted seed data (which uses plain
 * 4-digit numbers like "1042") or an earlier click.
 */
export function generateMockOrderNumber(): string {
  orderSequence += 1;
  return `MOCK-${Date.now()}-${orderSequence}`;
}

function item(
  name: string,
  station: ProductionStation,
  overrides: Partial<NormalizedOrderItem> = {},
): NormalizedOrderItem {
  return { name, quantity: 1, modifiers: [], station, ...overrides };
}

export const MOCK_POS_SCENARIOS: MockOrderScenario[] = [
  {
    id: "broil-only",
    label: "Broil Only",
    description: "A single steak — nothing but Broil involved.",
    stationsInvolved: ["BROIL"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Mock 1",
      server: "Mock POS",
      createdAt: new Date(),
      items: [item("6 oz Sirloin", "BROIL", { modifiers: ["Medium Rare"] })],
    }),
  },
  {
    id: "fry-only",
    label: "Fry Only",
    description: "A side order for the Fry station alone.",
    stationsInvolved: ["FRY"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Mock 2",
      server: "Mock POS",
      createdAt: new Date(),
      items: [item("Fried Pickles", "FRY")],
    }),
  },
  {
    id: "food-mix",
    label: "Food Mix",
    description: "One item on every food-production station.",
    stationsInvolved: ["BROIL", "FRY", "SALAD", "HOT_SIDE"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Mock 3",
      server: "Mock POS",
      createdAt: new Date(),
      items: [
        item("Dallas Filet", "BROIL", { modifiers: ["Medium"] }),
        item("Steak Fries", "FRY"),
        item("Caesar Salad", "SALAD"),
        item("Seasoned Rice", "HOT_SIDE"),
      ],
    }),
  },
  {
    id: "bar-only",
    label: "BAR Only (Dining Room)",
    description: "A drink ordered from a table — shows on BAR, never on Window.",
    stationsInvolved: ["BAR"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Mock 4",
      server: "Mock POS",
      createdAt: new Date(),
      items: [item("Margarita", "BAR", { modifiers: ["On the rocks"] })],
    }),
  },
  {
    id: "mixed-food-bar",
    label: "Mixed Food + BAR",
    description: "Steak, fries, and a drink — Window shows only the food side.",
    stationsInvolved: ["BROIL", "FRY", "BAR"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Mock 5",
      server: "Mock POS",
      createdAt: new Date(),
      items: [
        item("Ft. Worth Ribeye", "BROIL", { modifiers: ["Medium Rare"] }),
        item("Steak Fries", "FRY"),
        item("Margarita", "BAR"),
      ],
    }),
  },
  {
    id: "bar-origin",
    label: "Direct Bar Origin",
    description: "Ordered straight from the bartender — the drink is suppressed, food still routes.",
    stationsInvolved: ["BAR", "BROIL"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Bar 1",
      server: "Mock POS",
      createdAt: new Date(),
      originStation: "BAR",
      items: [item("Old Fashioned", "BAR"), item("6 oz Sirloin", "BROIL", { modifiers: ["Medium"] })],
    }),
  },
  {
    id: "bar-origin-drinks-only",
    label: "Bar Origin — Drinks Only",
    description: "Ordered at the bar, drinks only — accepted, but needs no KDS ticket at all.",
    stationsInvolved: ["BAR"],
    buildOrder: () => ({
      orderNumber: generateMockOrderNumber(),
      table: "Bar 2",
      server: "Mock POS",
      createdAt: new Date(),
      originStation: "BAR",
      items: [item("Margarita", "BAR")],
    }),
  },
];
