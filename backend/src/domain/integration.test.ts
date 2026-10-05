import { describe, expect, it } from "vitest";
import { DEFAULT_RESTAURANT_CONFIG } from "@zkds/shared";
import { bumpExpoOrder, bumpTicket, completeItem, recallExpoOrder } from "./mutations";
import { createOrder } from "./ingestion";
import { loadSnapshot } from "./snapshot";
import { cleanupOrder, testOrder } from "./testHelpers";

/**
 * The backend-side equivalent of Step 4's expoWorkflow.acceptance.test.ts —
 * same scenario, now against real Postgres persistence instead of an
 * in-memory reducer: create/load an order, complete a Fry item, bump Fry,
 * see Window-equivalent readiness, bump the remaining stations, Expo-bump,
 * Expo-recall, and confirm every station ticket stays BUMPED throughout.
 */
describe("integration: order lifecycle through the real backend", () => {
  it("walks the full BROIL + FRY dispatch lifecycle end to end", async () => {
    const tickets = await createOrder(
      testOrder({
        table: "18",
        server: "Maria",
        items: [
          { name: "Ft. Worth Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
          { name: "Steak Fries", quantity: 1, modifiers: [], station: "FRY" },
        ],
      }),
    );
    const orderId = tickets[0].orderId;

    try {
      const broil = tickets.find((t) => t.station === "BROIL")!;
      const fry = tickets.find((t) => t.station === "FRY")!;

      // Complete the Fry item — a fresh snapshot must reflect it (proves
      // real persistence, not just the in-process return value).
      await completeItem(fry.id, fry.items[0].id, new Date());
      let snapshot = await loadSnapshot();
      const fryNow = snapshot.tickets.find((t) => t.id === fry.id)!;
      expect(fryNow.items[0].status).toBe("READY");

      // Bump Fry — Expo bump must still be rejected (Broil isn't bumped yet).
      await bumpTicket(fry.id, new Date());
      let expoResult = await bumpExpoOrder(orderId, new Date(), DEFAULT_RESTAURANT_CONFIG);
      expect(expoResult.ok).toBe(false);

      // Bump Broil too — now every station ticket is bumped.
      await bumpTicket(broil.id, new Date());
      snapshot = await loadSnapshot();
      expect(snapshot.tickets.filter((t) => t.orderId === orderId).every((t) => t.status === "BUMPED")).toBe(true);

      // Expo bump now succeeds.
      expoResult = await bumpExpoOrder(orderId, new Date(), DEFAULT_RESTAURANT_CONFIG);
      expect(expoResult.ok).toBe(true);

      // Expo recall — station tickets remain BUMPED, never reopened.
      const recallResult = await recallExpoOrder(orderId, new Date());
      expect(recallResult.ok).toBe(true);
      if (recallResult.ok) expect(recallResult.expoOrder.status).toBe("RECALLED");

      snapshot = await loadSnapshot();
      const finalTickets = snapshot.tickets.filter((t) => t.orderId === orderId);
      expect(finalTickets).toHaveLength(2);
      expect(finalTickets.every((t) => t.status === "BUMPED")).toBe(true);
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
