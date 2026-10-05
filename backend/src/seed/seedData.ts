import {
  ACTIVE_RESTAURANT_CONFIG,
  isEnabledProductionStation,
  type NormalizedOrder,
  type ProductionStation,
  type RestaurantStationConfig,
} from "@zkds/shared";
import { createOrder } from "../domain/ingestion";
import { bumpTicket, completeItem } from "../domain/mutations";
import { logger } from "../logger";

/**
 * The same Texas Roadhouse-style demo dataset from Steps 1-4
 * (frontend/src/data/mockOrders.ts), reshaped as NormalizedOrders and posted
 * through the real ingestion boundary — this seed script is, structurally,
 * just a very simple POS adapter for the mock dataset. Pre-ready items and
 * the pre-bumped Broil-for-order-1039 demo scenario are applied afterward via
 * the same mutation functions any client would call, not a seed-only shortcut.
 *
 * Like any order source, the seed script must respect `ACTIVE_RESTAURANT_CONFIG`
 * — it validates every order against it (via the same `isEnabledProductionStation`
 * the HTTP API uses in `parseNormalizedOrder`) before calling `createOrder()`,
 * which stays completely config-agnostic. See `findDisabledStationReferences`.
 */

interface SeedItem {
  name: string;
  quantity: number;
  modifiers: string[];
  station: ProductionStation;
  ready?: boolean;
}

interface SeedOrder {
  orderNumber: string;
  table: string;
  server: string;
  minutesAgo: number;
  items: SeedItem[];
  /** Stations whose ticket should already be bumped once seeded. */
  preBumpedStations?: ProductionStation[];
  /** Step 6A: mirrors NormalizedOrder.originStation — see the BAR scenarios
   *  below for what this suppresses and why. */
  originStation?: ProductionStation;
}

const MS_PER_MINUTE = 60_000;

/** Exported for `seedData.test.ts` to validate the real demo dataset against
 *  both restaurant configs directly, not just synthetic fixtures. */
export const SEED_ORDERS: SeedOrder[] = [
  {
    orderNumber: "1042",
    table: "12",
    server: "Jordan",
    minutesAgo: 14.6,
    items: [
      { name: "Ft. Worth Ribeye", quantity: 1, modifiers: ["Medium Rare", "Extra seasoning"], station: "BROIL" },
      { name: "6 oz Sirloin", quantity: 2, modifiers: ["Well Done", "No seasoning"], station: "BROIL" },
      { name: "Caesar Salad", quantity: 2, modifiers: [], station: "SALAD" },
      { name: "Seasoned Rice", quantity: 2, modifiers: [], station: "HOT_SIDE" },
    ],
  },
  {
    orderNumber: "1044",
    table: "7",
    server: "Maria",
    minutesAgo: 12.3,
    items: [
      { name: "Ribs (Full Rack)", quantity: 1, modifiers: ["Sauce on side"], station: "BROIL" },
      { name: "Grilled BBQ Chicken", quantity: 1, modifiers: ["No glaze"], station: "BROIL" },
      { name: "Steak Fries", quantity: 2, modifiers: [], station: "FRY" },
      { name: "House Salad", quantity: 1, modifiers: [], station: "SALAD" },
    ],
  },
  {
    orderNumber: "1046",
    table: "21",
    server: "Devon",
    minutesAgo: 9.7,
    items: [
      { name: "Dallas Filet", quantity: 2, modifiers: ["Medium Rare"], station: "BROIL", ready: true },
      { name: "New York Strip", quantity: 1, modifiers: ["Medium Well", "Add mushrooms"], station: "BROIL" },
      { name: "Fried Pickles", quantity: 1, modifiers: [], station: "FRY" },
      { name: "Mashed Potatoes", quantity: 2, modifiers: [], station: "HOT_SIDE" },
    ],
  },
  {
    orderNumber: "1048",
    table: "18",
    server: "Maria",
    minutesAgo: 8.4,
    items: [
      { name: "8 oz Sirloin", quantity: 2, modifiers: ["Medium Rare"], station: "BROIL" },
      { name: "Ft. Worth Ribeye", quantity: 1, modifiers: ["Medium", "Add mushrooms"], station: "BROIL" },
      { name: "Cactus Blossom", quantity: 1, modifiers: ["Sauce on side"], station: "FRY" },
      { name: "Wedge Salad", quantity: 1, modifiers: [], station: "SALAD" },
    ],
  },
  {
    orderNumber: "1051",
    table: "4",
    server: "Alex",
    minutesAgo: 6.5,
    items: [
      { name: "Portobello Mushroom Chicken", quantity: 1, modifiers: ["Sauce on side"], station: "BROIL" },
      { name: "6 oz Sirloin", quantity: 1, modifiers: ["Medium"], station: "BROIL" },
      { name: "Loaded Sweet Potato", quantity: 1, modifiers: [], station: "HOT_SIDE" },
      { name: "Caesar Salad", quantity: 1, modifiers: [], station: "SALAD" },
    ],
  },
  {
    orderNumber: "1053",
    table: "30",
    server: "Priya",
    minutesAgo: 5.2,
    items: [
      { name: "8 oz Sirloin", quantity: 4, modifiers: ["Medium Well"], station: "BROIL" },
      { name: "Grilled BBQ Chicken", quantity: 1, modifiers: ["Extra seasoning"], station: "BROIL" },
      { name: "Fried Catfish", quantity: 1, modifiers: ["Tartar sauce on side"], station: "FRY" },
      { name: "Green Beans", quantity: 1, modifiers: [], station: "HOT_SIDE" },
    ],
  },
  {
    orderNumber: "1055",
    table: "15",
    server: "Jordan",
    minutesAgo: 2.4,
    items: [
      { name: "New York Strip", quantity: 1, modifiers: ["Rare"], station: "BROIL" },
      { name: "Dallas Filet", quantity: 1, modifiers: ["Medium"], station: "BROIL" },
      { name: "Ribs (Half Rack)", quantity: 1, modifiers: ["Sauce on side"], station: "BROIL" },
      { name: "House Salad", quantity: 2, modifiers: [], station: "SALAD" },
    ],
  },
  {
    orderNumber: "1057",
    table: "Bar 2",
    server: "Alex",
    minutesAgo: 0.8,
    items: [
      { name: "6 oz Sirloin", quantity: 1, modifiers: ["Medium Rare", "No seasoning"], station: "BROIL" },
      { name: "Grilled BBQ Chicken", quantity: 1, modifiers: [], station: "BROIL" },
      { name: "Steak Fries", quantity: 1, modifiers: [], station: "FRY" },
    ],
  },
  {
    // Broil is pre-bumped while Fry/Hot Side stay ACTIVE — seeds Window with a
    // real mixed-readiness order on first load, no clicking required.
    orderNumber: "1039",
    table: "9",
    server: "Devon",
    minutesAgo: 18.2,
    preBumpedStations: ["BROIL"],
    items: [
      { name: "Dallas Filet", quantity: 1, modifiers: ["Medium Rare"], station: "BROIL", ready: true },
      { name: "8 oz Sirloin", quantity: 1, modifiers: ["Medium"], station: "BROIL", ready: true },
      { name: "Fried Pickles", quantity: 1, modifiers: [], station: "FRY" },
      { name: "Green Beans", quantity: 1, modifiers: [], station: "HOT_SIDE" },
    ],
  },
  // --- Step 6A: BAR activation proof scenarios -----------------------------
  {
    // Scenario A — dining-room drink only. A normal table order with nothing
    // but a bartender-made drink: appears on BAR, never on Window (BAR isn't
    // an Expo-participating station).
    orderNumber: "1059",
    table: "22",
    server: "Priya",
    minutesAgo: 1.2,
    items: [
      { name: "Margarita", quantity: 1, modifiers: ["On the rocks"], station: "BAR" },
    ],
  },
  {
    // Scenario B — dining-room mixed food + drink. BROIL/FRY are Expo-
    // participating; BAR isn't. Window must show only the BROIL/FRY sections
    // and must be bumpable once they're bumped, regardless of BAR.
    orderNumber: "1061",
    table: "10",
    server: "Jordan",
    minutesAgo: 3.6,
    items: [
      { name: "Dallas Filet", quantity: 1, modifiers: ["Medium Rare"], station: "BROIL" },
      { name: "Steak Fries", quantity: 1, modifiers: [], station: "FRY" },
      { name: "Margarita", quantity: 1, modifiers: [], station: "BAR" },
    ],
  },
  {
    // Scenario C — direct bar-origin order. originStation: "BAR" means the
    // guest ordered straight from the bartender, so the Old Fashioned never
    // becomes a service-BAR ticket (the bartender is already making it in
    // front of them) — but the Sirloin still routes to BROIL normally.
    orderNumber: "1063",
    table: "Bar 4",
    server: "Alex",
    minutesAgo: 0.5,
    originStation: "BAR",
    items: [
      { name: "Old Fashioned", quantity: 1, modifiers: [], station: "BAR" },
      { name: "6 oz Sirloin", quantity: 1, modifiers: ["Medium"], station: "BROIL" },
    ],
  },
];

/** Exported for `seedData.test.ts` — lets a test build the real NormalizedOrder[]
 *  from SEED_ORDERS without duplicating this mapping. */
export function toNormalizedOrder(seedOrder: SeedOrder, now: Date): NormalizedOrder {
  return {
    orderNumber: seedOrder.orderNumber,
    table: seedOrder.table,
    server: seedOrder.server,
    createdAt: new Date(now.getTime() - seedOrder.minutesAgo * MS_PER_MINUTE),
    originStation: seedOrder.originStation,
    items: seedOrder.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers,
      station: item.station,
    })),
  };
}

/**
 * The same enablement rule `parseNormalizedOrder` enforces at the HTTP
 * boundary (`backend/src/api/router.ts`), applied here so the seed script
 * can't create a ticket for a station `config` doesn't enable. Generic over
 * any `ProductionStation` — nothing here names BAR specifically. Returns one
 * human-readable line per violation (empty when everything is compatible),
 * so a caller can decide what to do with them; `seedDatabase()` below fails
 * fast rather than silently skipping — see its own comment for why.
 */
export function findDisabledStationReferences(
  orders: NormalizedOrder[],
  config: RestaurantStationConfig,
): string[] {
  const problems: string[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      if (!isEnabledProductionStation(item.station, config)) {
        problems.push(
          `order #${order.orderNumber}: item "${item.name}" targets disabled station "${item.station}"`,
        );
      }
    }

    if (
      order.originStation !== undefined &&
      !isEnabledProductionStation(order.originStation, config)
    ) {
      problems.push(
        `order #${order.orderNumber}: originStation "${order.originStation}" is disabled`,
      );
    }
  }

  return problems;
}

export async function seedDatabase() {
  const now = new Date();
  const normalizedOrders = SEED_ORDERS.map((seedOrder) => toNormalizedOrder(seedOrder, now));

  // Fail fast, before touching the database at all: a config/seed-data
  // mismatch (e.g. ACTIVE_RESTAURANT_CONFIG flipped to a no-BAR config while
  // BAR demo orders are still in SEED_ORDERS) is a development mistake that
  // should be loud and immediate, not a few BAR tickets quietly missing from
  // an otherwise-successful seed run that nobody notices until Test A no
  // longer has anything to look at.
  const problems = findDisabledStationReferences(normalizedOrders, ACTIVE_RESTAURANT_CONFIG);
  if (problems.length > 0) {
    throw new Error(
      "Seed data is incompatible with ACTIVE_RESTAURANT_CONFIG — refusing to seed anything:\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nUpdate the seed data or ACTIVE_RESTAURANT_CONFIG so they agree.",
    );
  }

  logger.info("Seeding database", { orderCount: SEED_ORDERS.length });

  for (let i = 0; i < SEED_ORDERS.length; i++) {
    const seedOrder = SEED_ORDERS[i];
    const normalized = normalizedOrders[i];
    const createdAt = normalized.createdAt!;

    const tickets = await createOrder(normalized);

    for (const ticket of tickets) {
      for (const item of ticket.items) {
        const seedItem = seedOrder.items.find(
          (i) => i.station === ticket.station && i.name === item.name,
        );
        if (seedItem?.ready) {
          await completeItem(ticket.id, item.id, createdAt);
        }
      }

      if (seedOrder.preBumpedStations?.some((station) => station === ticket.station)) {
        await bumpTicket(ticket.id, createdAt);
      }
    }

    logger.info(`Seeded order #${seedOrder.orderNumber}`, { tickets: tickets.length });
  }

  logger.info("Seed complete");
}
