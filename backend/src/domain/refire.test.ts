import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_RESTAURANT_CONFIG } from "@zkds/shared";
import {
  bumpExpoOrder,
  bumpTicket,
  completeItem,
  createRefire,
  recallTicket,
  uncompleteItem,
} from "./mutations";
import { createOrder } from "./ingestion";
import { loadSnapshot } from "./snapshot";
import { cleanupOrder, testOrder } from "./testHelpers";

describe("createRefire", () => {
  let orderId: string | undefined;

  afterEach(async () => {
    if (orderId) await cleanupOrder(orderId);
    orderId = undefined;
  });

  async function seedOriginTicket() {
    const tickets = await createOrder(
      testOrder({
        items: [
          { name: "Dallas Filet", quantity: 1, modifiers: ["Medium Rare"], station: "BROIL" },
          { name: "Chicken", quantity: 1, modifiers: [], station: "BROIL" },
        ],
      }),
    );
    orderId = tickets[0].orderId;
    const originTicket = tickets[0];
    const originItem = originTicket.items.find((i) => i.name === "Dallas Filet")!;
    return { originTicket, originItem };
  }

  it("creates a new ticket id and item id, both distinct from the origin's", async () => {
    const { originTicket, originItem } = await seedOriginTicket();

    const result = await createRefire(originTicket.id, originItem.id, new Date());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const refire = result.ticket;

    expect(refire.id).not.toBe(originTicket.id);
    expect(refire.items[0].id).not.toBe(originItem.id);
    expect(refire.items[0].id).not.toBe(refire.id);
  });

  it("stores provenance pointing at the exact source ticket and item", async () => {
    const { originTicket, originItem } = await seedOriginTicket();

    const result = await createRefire(originTicket.id, originItem.id, new Date());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ticket.refire).toEqual({
      originTicketId: originTicket.id,
      originItemId: originItem.id,
    });
    expect(result.ticket.orderId).toBe(originTicket.orderId);
  });

  it("copies name, modifiers, and station; item quantity is exactly 1; status starts ACTIVE/PENDING", async () => {
    const { originTicket, originItem } = await seedOriginTicket();

    const result = await createRefire(originTicket.id, originItem.id, new Date());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const refire = result.ticket;

    expect(refire.station).toBe("BROIL");
    expect(refire.status).toBe("ACTIVE");
    expect(refire.items).toHaveLength(1);
    expect(refire.items[0].name).toBe("Dallas Filet");
    expect(refire.items[0].modifiers).toEqual(["Medium Rare"]);
    expect(refire.items[0].station).toBe("BROIL");
    expect(refire.items[0].quantity).toBe(1);
    expect(refire.items[0].status).toBe("PENDING");
  });

  it("leaves the original ticket and item completely unchanged", async () => {
    const { originTicket, originItem } = await seedOriginTicket();

    await createRefire(originTicket.id, originItem.id, new Date());

    const snapshot = await loadSnapshot();
    const stillThere = snapshot.tickets.find((t) => t.id === originTicket.id)!;
    expect(stillThere.status).toBe("ACTIVE");
    expect(stillThere.items).toHaveLength(2);
    const stillThereItem = stillThere.items.find((i) => i.id === originItem.id)!;
    expect(stillThereItem.status).toBe("PENDING");
    expect(stillThereItem.name).toBe("Dallas Filet");
  });

  describe("source ticket status", () => {
    it("can originate from an ACTIVE source ticket", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const result = await createRefire(originTicket.id, originItem.id, new Date());
      expect(result.ok).toBe(true);
    });

    it("can originate from a BUMPED source ticket", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      await bumpTicket(originTicket.id, new Date());

      const result = await createRefire(originTicket.id, originItem.id, new Date());

      expect(result.ok).toBe(true);
      // The bump is untouched by the refire creation.
      const snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.status).toBe("BUMPED");
    });

    it("can originate from a RECALLED source ticket", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      await bumpTicket(originTicket.id, new Date());
      await recallTicket(originTicket.id, new Date());

      const result = await createRefire(originTicket.id, originItem.id, new Date());

      expect(result.ok).toBe(true);
      const snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.status).toBe("RECALLED");
    });
  });

  describe("validation", () => {
    it("returns TICKET_NOT_FOUND for a nonexistent ticket, and creates nothing", async () => {
      const before = await loadSnapshot();

      const result = await createRefire("does-not-exist", "does-not-exist", new Date());

      expect(result).toEqual({ ok: false, reason: "TICKET_NOT_FOUND" });
      const after = await loadSnapshot();
      expect(after.tickets.length).toBe(before.tickets.length);
    });

    it("returns ITEM_NOT_FOUND when the item doesn't belong to the ticket, and creates nothing", async () => {
      const { originTicket } = await seedOriginTicket();
      const before = await loadSnapshot();

      const result = await createRefire(originTicket.id, "not-a-real-item-id", new Date());

      expect(result).toEqual({ ok: false, reason: "ITEM_NOT_FOUND" });
      const after = await loadSnapshot();
      expect(after.tickets.length).toBe(before.tickets.length);
    });
  });

  describe("independent lifecycle", () => {
    it("READY/PENDING toggles affect only the refire item, never the origin", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const result = await createRefire(originTicket.id, originItem.id, new Date());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const refire = result.ticket;

      const completed = await completeItem(refire.id, refire.items[0].id, new Date());
      expect(completed?.items[0].status).toBe("READY");

      let snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.items.find((i) => i.id === originItem.id)?.status).toBe("PENDING");

      const uncompleted = await uncompleteItem(refire.id, refire.items[0].id);
      expect(uncompleted?.items[0].status).toBe("PENDING");

      snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.status).toBe("ACTIVE");
    });

    it("BUMP affects only the refire ticket, never the origin", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const result = await createRefire(originTicket.id, originItem.id, new Date());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const refire = result.ticket;

      const bumped = await bumpTicket(refire.id, new Date());
      expect(bumped?.status).toBe("BUMPED");

      const snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.status).toBe("ACTIVE");
    });

    it("RECALL affects only the refire ticket, never the origin", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const result = await createRefire(originTicket.id, originItem.id, new Date());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const refire = result.ticket;

      await bumpTicket(refire.id, new Date());
      const recalled = await recallTicket(refire.id, new Date());
      expect(recalled?.status).toBe("RECALLED");

      const snapshot = await loadSnapshot();
      expect(snapshot.tickets.find((t) => t.id === originTicket.id)?.status).toBe("ACTIVE");
    });
  });

  describe("repeated refires", () => {
    it("creates independent tickets/items each time, all pointing at the same origin", async () => {
      const { originTicket, originItem } = await seedOriginTicket();

      const first = await createRefire(originTicket.id, originItem.id, new Date());
      const second = await createRefire(originTicket.id, originItem.id, new Date());

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.ticket.id).not.toBe(second.ticket.id);
      expect(first.ticket.items[0].id).not.toBe(second.ticket.items[0].id);
      expect(first.ticket.refire?.originItemId).toBe(originItem.id);
      expect(second.ticket.refire?.originItemId).toBe(originItem.id);

      const snapshot = await loadSnapshot();
      const refireCount = snapshot.tickets.filter(
        (t) => t.refire?.originItemId === originItem.id,
      ).length;
      expect(refireCount).toBe(2);
    });
  });

  describe("persistence", () => {
    it("a created refire appears in a fresh snapshot read", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const result = await createRefire(originTicket.id, originItem.id, new Date());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const snapshot = await loadSnapshot();
      const persisted = snapshot.tickets.find((t) => t.id === result.ticket.id);
      expect(persisted).toBeDefined();
      expect(persisted?.refire).toEqual(result.ticket.refire);
      expect(persisted?.items[0].id).toBe(result.ticket.items[0].id);
    });
  });

  describe("Expo independence", () => {
    it("an active refire does not block Window BUMP once normal Expo tickets are bumped", async () => {
      const { originTicket, originItem } = await seedOriginTicket();
      const refireResult = await createRefire(originTicket.id, originItem.id, new Date());
      expect(refireResult.ok).toBe(true);

      // Bump the one (and only) normal station ticket for this order.
      await bumpTicket(originTicket.id, new Date());

      const expoResult = await bumpExpoOrder(orderId!, new Date(), DEFAULT_RESTAURANT_CONFIG);

      expect(expoResult.ok).toBe(true);
    });

    it("refire creation never touches expo_orders", async () => {
      const { originTicket, originItem } = await seedOriginTicket();

      await createRefire(originTicket.id, originItem.id, new Date());

      const snapshot = await loadSnapshot();
      expect(snapshot.expoOrders[orderId!]).toBeUndefined();
    });
  });
});
