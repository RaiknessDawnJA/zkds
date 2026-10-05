import {
  routeOrderToStationTickets,
  type Order,
  type OrderItem,
  type Station,
  type StationTicket,
  type StationTicketStatus,
} from "@zkds/shared";

/**
 * Step 3.5 performance-testing fixture only. Generates a synthetic restaurant
 * workload for benchmarking and render-profiling — never imported by the app
 * itself, so it can never leak into the real mock data path exercised by
 * `data/mockOrders.ts` / `data/mockTickets.ts`.
 *
 * Deliberately frozen to the four original production stations regardless of
 * what else `Station`/`ProductionStation` grows to include (e.g. `BAR`) —
 * this is a fixed benchmarking profile, not "whatever stations exist now".
 */
type StressStation = Exclude<Station, "WINDOW" | "BAR">;

const MENU: Record<StressStation, string[]> = {
  BROIL: ["6 oz Sirloin", "8 oz Sirloin", "Dallas Filet", "Ft. Worth Ribeye", "Ribs"],
  FRY: ["Steak Fries", "Fried Pickles", "Cactus Blossom", "Fried Catfish"],
  SALAD: ["Caesar Salad", "House Salad", "Wedge Salad"],
  HOT_SIDE: ["Mashed Potatoes", "Seasoned Rice", "Green Beans", "Loaded Sweet Potato"],
};

const STATION_CYCLE: StressStation[] = ["BROIL", "FRY", "SALAD", "HOT_SIDE"];

const MODIFIER_POOL = [
  "Medium Rare",
  "Medium",
  "Well Done",
  "No seasoning",
  "Extra seasoning",
  "Sauce on side",
];

const SERVERS = ["Jordan", "Maria", "Devon", "Alex", "Priya", "Sam", "Casey"];

const MS_PER_MINUTE = 60_000;

/**
 * `orderCount` synthetic orders, each spanning 1-3 stations, spread across
 * every urgency band, seeded relative to `now`. Deterministic (no Math.random)
 * so repeated benchmark runs are directly comparable.
 */
function generateStressOrders(orderCount: number, now: Date): Order[] {
  const orders: Order[] = [];

  for (let i = 0; i < orderCount; i++) {
    // Deterministic spread from 0 to ~24 minutes old, covering every
    // NORMAL/WARNING/LATE/CRITICAL band repeatedly across the dataset.
    const minutesAgo = (i * 37) % 1440 / 60;
    const createdAt = new Date(now.getTime() - minutesAgo * MS_PER_MINUTE);
    const stationCount = 1 + (i % 3); // 1-3 stations per order
    const items: OrderItem[] = [];

    for (let s = 0; s < stationCount; s++) {
      const station = STATION_CYCLE[(i + s) % STATION_CYCLE.length];
      const menu = MENU[station];
      const itemsForStation = 1 + ((i + s) % 2); // 1-2 items per station

      for (let n = 0; n < itemsForStation; n++) {
        const name = menu[(i + s + n) % menu.length];
        items.push({
          id: `S${i}-${station}-${n}`,
          name,
          quantity: 1 + ((i + n) % 3),
          modifiers:
            n % 2 === 0
              ? [MODIFIER_POOL[(i + n) % MODIFIER_POOL.length]]
              : [],
          station,
          status: "PENDING",
          sentAt: createdAt,
        });
      }
    }

    orders.push({
      id: `stress-order-${i}`,
      orderNumber: `S${i}`,
      table: String((i % 40) + 1),
      server: SERVERS[i % SERVERS.length],
      createdAt,
      items,
    });
  }

  return orders;
}

/**
 * The full StationTicket[] a stress-tested screen would actually read: routed
 * through the real routing function, then given a realistic ACTIVE/BUMPED/
 * RECALLED distribution (roughly 70/20/10) so All Day, Window's waitingOn, and
 * the RECALL views all have real data to aggregate.
 */
export function generateStressTickets(
  orderCount: number,
  now: Date = new Date(),
): StationTicket[] {
  const tickets = generateStressOrders(orderCount, now).flatMap(
    routeOrderToStationTickets,
  );

  return tickets.map((ticket, index) => {
    const cycle = index % 10;
    const status: StationTicketStatus =
      cycle < 7 ? "ACTIVE" : cycle < 9 ? "BUMPED" : "RECALLED";

    if (status === "ACTIVE") return ticket;

    const bumpedAt = new Date(now.getTime() - (index % 15) * MS_PER_MINUTE);
    if (status === "BUMPED") {
      return { ...ticket, status, bumpedAt };
    }

    // RECALLED: was bumped, then pulled back — both timestamps set.
    const recalledAt = new Date(bumpedAt.getTime() + 2 * MS_PER_MINUTE);
    return { ...ticket, status, bumpedAt, recalledAt };
  });
}
