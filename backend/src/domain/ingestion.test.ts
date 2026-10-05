import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../db/client";
import { orders } from "../db/schema";
import { SEED_ORDERS, toNormalizedOrder } from "../seed/seedData";
import { createOrder } from "./ingestion";
import { completeItem } from "./mutations";
import { loadSnapshot } from "./snapshot";
import { cleanupOrder, testOrder } from "./testHelpers";

describe("createOrder (POS-neutral ingestion boundary)", () => {
  let createdOrderId: string | undefined;

  afterEach(async () => {
    if (createdOrderId) await cleanupOrder(createdOrderId);
    createdOrderId = undefined;
  });

  it("persists a multi-station order and routes items into separate tickets", async () => {
    // quantity: 1 deliberately — this test is about routing across stations,
    // not quantity expansion (see the "expands a quantity > 1 line" tests
    // below for that, and No-stacking Invariant note above).
    const normalized = testOrder({
      items: [
        { name: "Ribeye", quantity: 1, modifiers: ["Medium Rare"], station: "BROIL" },
        { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
      ],
    });

    const tickets = await createOrder(normalized);
    createdOrderId = tickets[0].orderId;

    expect(tickets).toHaveLength(2);
    const broil = tickets.find((t) => t.station === "BROIL")!;
    const fry = tickets.find((t) => t.station === "FRY")!;

    expect(broil.items).toHaveLength(1);
    expect(broil.items[0].name).toBe("Ribeye");
    expect(broil.items[0].modifiers).toEqual(["Medium Rare"]);
    expect(broil.items[0].status).toBe("PENDING");
    expect(fry.items[0].name).toBe("Fries");

    // A restart-simulating fresh read (loadSnapshot) sees the same data —
    // this is the actual persistence guarantee, not just the return value.
    const snapshot = await loadSnapshot();
    const persistedBroil = snapshot.tickets.find((t) => t.id === broil.id);
    expect(persistedBroil?.items[0].name).toBe("Ribeye");
  });

  it("gives every station ticket its own id and ACTIVE status", async () => {
    const tickets = await createOrder(testOrder());
    createdOrderId = tickets[0].orderId;

    for (const ticket of tickets) {
      expect(ticket.status).toBe("ACTIVE");
      expect(ticket.id).toBeTruthy();
    }
    expect(new Set(tickets.map((t) => t.id)).size).toBe(tickets.length);
  });

  it("falls back to now() when createdAt is omitted", async () => {
    const before = Date.now();
    const tickets = await createOrder(testOrder({ createdAt: undefined }));
    createdOrderId = tickets[0].orderId;
    const after = Date.now();

    const createdAt = tickets[0].createdAt.getTime();
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it("does not appear in the snapshot for an unrelated order after cleanup", async () => {
    const tickets = await createOrder(testOrder());
    const orderId = tickets[0].orderId;
    await cleanupOrder(orderId);

    const snapshot = await loadSnapshot();
    expect(snapshot.tickets.some((t) => t.orderId === orderId)).toBe(false);
  });

  describe("originStation suppression", () => {
    it("creates no ticket, and no orders row at all, when every item is suppressed", async () => {
      const normalized = testOrder({
        originStation: "BAR",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      });

      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0]?.orderId; // undefined — afterEach no-ops, correctly

      expect(tickets).toEqual([]);

      const persisted = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.orderNumber, normalized.orderNumber));
      expect(persisted).toEqual([]);
    });

    it("suppresses only the origin-station item, still routing the rest normally", async () => {
      const normalized = testOrder({
        originStation: "BAR",
        items: [
          { name: "Margarita", quantity: 1, modifiers: [], station: "BAR" },
          { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
        ],
      });

      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0].orderId;

      expect(tickets).toHaveLength(1);
      expect(tickets[0].station).toBe("BROIL");
      expect(tickets[0].items.map((i) => i.name)).toEqual(["Ribeye"]);

      // Confirms the order itself DID persist (unlike the fully-suppressed
      // case above) — only the BAR item was excluded, not the whole order.
      const snapshot = await loadSnapshot();
      expect(snapshot.tickets.some((t) => t.orderId === createdOrderId)).toBe(true);
      expect(snapshot.tickets.some((t) => t.station === "BAR" && t.orderId === createdOrderId)).toBe(
        false,
      );
    });

    it("does not suppress anything when originStation is unset", async () => {
      const normalized = testOrder({
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      });

      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0].orderId;

      expect(tickets).toHaveLength(1);
      expect(tickets[0].station).toBe("BAR");
    });
  });

  describe("no-stacking invariant (Step 6C)", () => {
    it("expands a quantity: 4 line into 4 independent internal items", async () => {
      const normalized = testOrder({
        items: [
          {
            name: "8 oz Sirloin",
            quantity: 4,
            modifiers: ["Medium Rare"],
            station: "BROIL",
          },
        ],
      });

      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0].orderId;

      expect(tickets).toHaveLength(1);
      const broil = tickets[0];
      expect(broil.items).toHaveLength(4);

      // Distinct ids — never merged/deduplicated.
      const ids = broil.items.map((item) => item.id);
      expect(new Set(ids).size).toBe(4);

      // Every expanded item preserves name/modifiers/station and is its own
      // independent quantity-1 unit.
      for (const item of broil.items) {
        expect(item.name).toBe("8 oz Sirloin");
        expect(item.modifiers).toEqual(["Medium Rare"]);
        expect(item.station).toBe("BROIL");
        expect(item.quantity).toBe(1);
        expect(item.status).toBe("PENDING");
      }

      // Persists correctly too — a fresh read sees the same 4 independent rows.
      const snapshot = await loadSnapshot();
      const persisted = snapshot.tickets.find((t) => t.id === broil.id);
      expect(persisted?.items).toHaveLength(4);
      expect(persisted?.items.every((item) => item.quantity === 1)).toBe(true);
    });

    it("completing one expanded item leaves the other three PENDING — the completion-granularity regression test", async () => {
      const normalized = testOrder({
        items: [
          { name: "8 oz Sirloin", quantity: 4, modifiers: [], station: "BROIL" },
        ],
      });

      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0].orderId;
      const ticket = tickets[0];
      const [first, ...rest] = ticket.items;
      expect(rest).toHaveLength(3);

      const updated = await completeItem(ticket.id, first.id, new Date());

      const completedItem = updated?.items.find((item) => item.id === first.id);
      expect(completedItem?.status).toBe("READY");

      for (const item of rest) {
        const stillPending = updated?.items.find((i) => i.id === item.id);
        expect(stillPending?.status).toBe("PENDING");
      }

      // A fresh read confirms this isn't just an in-memory artifact of the
      // return value — persistence has exactly one READY item, three PENDING.
      const snapshot = await loadSnapshot();
      const persisted = snapshot.tickets.find((t) => t.id === ticket.id)!;
      const readyCount = persisted.items.filter((item) => item.status === "READY").length;
      const pendingCount = persisted.items.filter((item) => item.status === "PENDING").length;
      expect(readyCount).toBe(1);
      expect(pendingCount).toBe(3);
    });

    it("the real seeded '8 oz Sirloin x4' demo line (order #1053) expands into 4 independent items", async () => {
      const seedOrder1053 = SEED_ORDERS.find((o) => o.orderNumber === "1053");
      if (!seedOrder1053) {
        throw new Error("Seed order #1053 not found — demo dataset changed; update this test");
      }
      const sirloinLine = seedOrder1053.items.find((i) => i.name === "8 oz Sirloin");
      expect(sirloinLine?.quantity).toBe(4); // the exact line this test exists to protect

      const normalized = toNormalizedOrder(seedOrder1053, new Date());
      const tickets = await createOrder(normalized);
      createdOrderId = tickets[0].orderId;

      const broil = tickets.find((t) => t.station === "BROIL")!;
      const sirloinItems = broil.items.filter((item) => item.name === "8 oz Sirloin");

      expect(sirloinItems).toHaveLength(4);
      expect(sirloinItems.every((item) => item.quantity === 1)).toBe(true);
      expect(new Set(sirloinItems.map((item) => item.id)).size).toBe(4);
    });
  });
});
