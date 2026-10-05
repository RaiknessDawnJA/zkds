import { afterEach, describe, expect, it } from "vitest";
import { BAR_ENABLED_CONFIG, DEFAULT_RESTAURANT_CONFIG } from "@zkds/shared";
import {
  bumpExpoOrder,
  bumpTicket,
  completeItem,
  recallExpoOrder,
  recallTicket,
  uncompleteItem,
} from "./mutations";
import { createOrder } from "./ingestion";
import { loadSnapshot } from "./snapshot";
import { cleanupOrder, testOrder } from "./testHelpers";

describe("mutations (DB-backed transitions)", () => {
  let orderId: string | undefined;

  afterEach(async () => {
    if (orderId) await cleanupOrder(orderId);
    orderId = undefined;
  });

  describe("item completion", () => {
    it("marks only the targeted item READY, leaving the sibling item untouched", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [
            { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
            { name: "Sirloin", quantity: 1, modifiers: [], station: "BROIL" },
          ],
        }),
      );
      orderId = tickets[0].orderId;
      const ticket = tickets[0];
      const [itemA, itemB] = ticket.items;

      const updated = await completeItem(ticket.id, itemA.id, new Date());

      expect(updated?.items.find((i) => i.id === itemA.id)?.status).toBe("READY");
      expect(updated?.items.find((i) => i.id === itemB.id)?.status).toBe("PENDING");
    });

    it("uncompletes an item back to PENDING", async () => {
      const tickets = await createOrder(testOrder());
      orderId = tickets[0].orderId;
      const ticket = tickets[0];
      const itemId = ticket.items[0].id;

      await completeItem(ticket.id, itemId, new Date());
      const updated = await uncompleteItem(ticket.id, itemId);

      expect(updated?.items.find((i) => i.id === itemId)?.status).toBe("PENDING");
      expect(updated?.items.find((i) => i.id === itemId)?.completedAt).toBeUndefined();
    });

    it("returns null for an unknown ticket", async () => {
      const result = await completeItem("does-not-exist", "nope", new Date());
      expect(result).toBeNull();
    });
  });

  describe("station bump/recall", () => {
    it("bumps only the targeted ticket, leaving a sibling station's ticket unaffected", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [
            { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
            { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
          ],
        }),
      );
      orderId = tickets[0].orderId;
      const broil = tickets.find((t) => t.station === "BROIL")!;
      const fry = tickets.find((t) => t.station === "FRY")!;

      const bumped = await bumpTicket(broil.id, new Date());
      expect(bumped?.status).toBe("BUMPED");

      const stillActive = await bumpTicket(fry.id, new Date());
      // fry hasn't been bumped before this call — confirms it started ACTIVE,
      // independent of broil's bump.
      expect(stillActive?.status).toBe("BUMPED");
      expect(stillActive?.id).not.toBe(bumped?.id);
    });

    it("recalls a bumped ticket back to RECALLED", async () => {
      const tickets = await createOrder(testOrder());
      orderId = tickets[0].orderId;
      const ticket = tickets[0];

      await bumpTicket(ticket.id, new Date());
      const recalled = await recallTicket(ticket.id, new Date());

      expect(recalled?.status).toBe("RECALLED");
    });

    it("rejects recalling a ticket that was never bumped", async () => {
      const tickets = await createOrder(testOrder());
      orderId = tickets[0].orderId;

      const result = await recallTicket(tickets[0].id, new Date());
      expect(result).toBeNull();
    });
  });

  describe("Expo bump/recall", () => {
    it("rejects Expo bump until every station ticket is bumped", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [
            { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
            { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
          ],
        }),
      );
      orderId = tickets[0].orderId;
      const broil = tickets.find((t) => t.station === "BROIL")!;

      await bumpTicket(broil.id, new Date()); // only BROIL bumped, FRY still active

      const result = await bumpExpoOrder(orderId, new Date(), DEFAULT_RESTAURANT_CONFIG);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NOT_READY");
    });

    it("succeeds once every station ticket is bumped, touching only expo state", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [
            { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
            { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
          ],
        }),
      );
      orderId = tickets[0].orderId;
      for (const ticket of tickets) await bumpTicket(ticket.id, new Date());

      const result = await bumpExpoOrder(orderId, new Date(), DEFAULT_RESTAURANT_CONFIG);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.expoOrder.status).toBe("BUMPED");

      // Station tickets are still exactly BUMPED — Expo bump didn't touch them.
      const bumpedAgain = await bumpTicket(tickets[0].id, new Date());
      expect(bumpedAgain).toBeNull(); // already bumped -> no-op, proves status unchanged
    });

    it("Expo recall restores Expo's active board without reopening station tickets", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [{ name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" }],
        }),
      );
      orderId = tickets[0].orderId;
      await bumpTicket(tickets[0].id, new Date());
      await bumpExpoOrder(orderId, new Date(), DEFAULT_RESTAURANT_CONFIG);

      const recalled = await recallExpoOrder(orderId, new Date());
      expect(recalled.ok).toBe(true);
      if (recalled.ok) expect(recalled.expoOrder.status).toBe("RECALLED");

      // The station ticket must still be BUMPED, not reactivated.
      const stillBumped = await recallTicket(tickets[0].id, new Date());
      expect(stillBumped?.status).toBe("RECALLED"); // it WAS bumped, recall succeeds normally
    });

    it("rejects Expo recall for an order that was never Expo-bumped", async () => {
      const tickets = await createOrder(testOrder());
      orderId = tickets[0].orderId;

      const result = await recallExpoOrder(orderId, new Date());
      expect(result.ok).toBe(false);
    });
  });

  describe("Expo eligibility ignores non-Expo-participating stations (BAR)", () => {
    it("rejects Expo bump for a BAR-only order — it has no Expo-participating ticket", async () => {
      const tickets = await createOrder(
        testOrder({ items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }] }),
      );
      orderId = tickets[0].orderId;

      const result = await bumpExpoOrder(orderId, new Date(), BAR_ENABLED_CONFIG);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NOT_READY");
    });

    it("still rejects a BAR-only order's Expo bump even once the BAR ticket itself is bumped", async () => {
      // Proves the rejection is because zero *qualifying* tickets exist, not
      // because BAR happened to be unbumped — the classic empty-set trap.
      const tickets = await createOrder(
        testOrder({ items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }] }),
      );
      orderId = tickets[0].orderId;
      await bumpTicket(tickets[0].id, new Date());

      const result = await bumpExpoOrder(orderId, new Date(), BAR_ENABLED_CONFIG);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("NOT_READY");
    });

    it("succeeds for a BROIL+BAR order once BROIL is bumped, regardless of BAR's bump state", async () => {
      const tickets = await createOrder(
        testOrder({
          items: [
            { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
            { name: "Margarita", quantity: 1, modifiers: [], station: "BAR" },
          ],
        }),
      );
      orderId = tickets[0].orderId;
      const broil = tickets.find((t) => t.station === "BROIL")!;
      // BAR is deliberately left unbumped.
      await bumpTicket(broil.id, new Date());

      const result = await bumpExpoOrder(orderId, new Date(), BAR_ENABLED_CONFIG);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.expoOrder.status).toBe("BUMPED");
    });

    it("BAR BUMP/RECALL never creates or touches an Expo lifecycle record", async () => {
      const tickets = await createOrder(
        testOrder({ items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }] }),
      );
      orderId = tickets[0].orderId;

      const bumped = await bumpTicket(tickets[0].id, new Date());
      expect(bumped?.status).toBe("BUMPED");
      let snapshot = await loadSnapshot();
      expect(snapshot.expoOrders[orderId]).toBeUndefined();

      const recalled = await recallTicket(tickets[0].id, new Date());
      expect(recalled?.status).toBe("RECALLED");
      snapshot = await loadSnapshot();
      expect(snapshot.expoOrders[orderId]).toBeUndefined();
    });
  });
});
