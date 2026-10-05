import express from "express";
import type { Server } from "node:http";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BAR_ENABLED_CONFIG, DEFAULT_RESTAURANT_CONFIG } from "@zkds/shared";
import { cleanupOrder } from "../domain/testHelpers";
import { attachRealtimeServer } from "../realtime/server";
import { apiRouter, parseNormalizedOrder } from "./router";

describe("parseNormalizedOrder", () => {
  it("accepts an order with items on every production station", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9001",
        table: "5",
        server: "Sam",
        items: [
          { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
          { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
          { name: "Salad", quantity: 1, modifiers: [], station: "SALAD" },
          { name: "Rice", quantity: 1, modifiers: [], station: "HOT_SIDE" },
        ],
      },
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.items.map((item) => item.station)).toEqual([
      "BROIL",
      "FRY",
      "SALAD",
      "HOT_SIDE",
    ]);
  });

  it("rejects an item targeting WINDOW", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9002",
        table: "5",
        server: "Sam",
        items: [{ name: "Note", quantity: 1, modifiers: [], station: "WINDOW" }],
      },
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(parsed).toBeNull();
  });

  it("rejects an unrecognized station outright", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9003",
        table: "5",
        server: "Sam",
        items: [{ name: "Note", quantity: 1, modifiers: [], station: "GRILL" }],
      },
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(parsed).toBeNull();
  });

  it("rejects BAR under the default config — structurally valid, but not enabled here", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9004",
        table: "5",
        server: "Sam",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      },
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(parsed).toBeNull();
  });

  it("accepts BAR when the restaurant's config enables it", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9005",
        table: "5",
        server: "Sam",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      },
      BAR_ENABLED_CONFIG,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.items[0]?.station).toBe("BAR");
  });

  it("accepts a valid, enabled originStation", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9006",
        table: "Bar 3",
        server: "Sam",
        originStation: "BAR",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      },
      BAR_ENABLED_CONFIG,
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.originStation).toBe("BAR");
  });

  it("rejects an originStation that isn't enabled for this restaurant", () => {
    const parsed = parseNormalizedOrder(
      {
        orderNumber: "9007",
        table: "Bar 3",
        server: "Sam",
        originStation: "BAR",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      },
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(parsed).toBeNull();
  });

  describe("quantity validation (Step 6C)", () => {
    function orderWithQuantity(quantity: unknown) {
      return parseNormalizedOrder(
        {
          orderNumber: "9100",
          table: "5",
          server: "Sam",
          items: [{ name: "Sirloin", quantity, modifiers: [], station: "BROIL" }],
        },
        DEFAULT_RESTAURANT_CONFIG,
      );
    }

    it.each([NaN, 2.5, 0, -1, 51])("rejects quantity %s", (quantity) => {
      expect(orderWithQuantity(quantity)).toBeNull();
    });

    it.each([1, 4, 50])("accepts quantity %s", (quantity) => {
      const parsed = orderWithQuantity(quantity);
      expect(parsed).not.toBeNull();
      expect(parsed?.items[0]?.quantity).toBe(quantity);
    });
  });
});

/**
 * HTTP-level proof that POST /api/orders enforces this at the wire boundary,
 * not just for internal TypeScript callers already blocked at compile time by
 * NormalizedOrderItem.station's narrowed type. A raw JSON payload (as any
 * non-TS POS adapter would send) still can't get a WINDOW item through.
 */
describe("POST /api/orders — production-station enforcement", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", apiRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("creates station tickets only on production stations", async () => {
    const orderNumber = `TEST-PROD-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        table: "5",
        server: "Sam",
        items: [
          { name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
          { name: "Fries", quantity: 1, modifiers: [], station: "FRY" },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const tickets = (await res.json()) as Array<{ orderId: string; station: string }>;
    expect(tickets.map((t) => t.station).sort()).toEqual(["BROIL", "FRY"]);

    await cleanupOrder(tickets[0].orderId);
  });

  it("rejects an order with a WINDOW item with 400 and creates nothing", async () => {
    const orderNumber = `TEST-WINDOW-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        table: "5",
        server: "Sam",
        items: [{ name: "Expo note", quantity: 1, modifiers: [], station: "WINDOW" }],
      }),
    });

    expect(res.status).toBe(400);

    // Nothing was persisted — no station ticket for this order exists at all.
    const snapshotRes = await fetch(`${baseUrl}/api/kitchen/snapshot`);
    const snapshot = (await snapshotRes.json()) as { tickets: Array<{ orderNumber: string }> };
    expect(snapshot.tickets.some((t) => t.orderNumber === orderNumber)).toBe(false);
  });

  it("accepts an order with a BAR item — Step 6A: this app runs BAR-enabled (ACTIVE_RESTAURANT_CONFIG)", async () => {
    const orderNumber = `TEST-BAR-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        table: "5",
        server: "Sam",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      }),
    });

    expect(res.status).toBe(201);
    const tickets = (await res.json()) as Array<{ orderId: string; station: string }>;
    expect(tickets.map((t) => t.station)).toEqual(["BAR"]);

    await cleanupOrder(tickets[0].orderId);
  });

  it("rejects a WINDOW item with 400 even though this app is BAR-enabled — WINDOW is never a production station", async () => {
    const orderNumber = `TEST-WINDOW2-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        table: "5",
        server: "Sam",
        items: [{ name: "Expo note", quantity: 1, modifiers: [], station: "WINDOW" }],
      }),
    });

    expect(res.status).toBe(400);
  });
});

/**
 * Step 6A: the fully origin-suppressed case ("200 [], persists nothing,
 * broadcasts nothing") proven literally over a real WebSocket connection to
 * this same app, not inferred from the HTTP status alone. The control case
 * (a normal order) proves the listener itself is actually working — without
 * it, a bug that silently dropped ALL broadcasts would pass the suppressed
 * case for the wrong reason.
 */
describe("POST /api/orders — fully origin-suppressed order broadcasts nothing", () => {
  let server: Server;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", apiRouter);
    server = app.listen(0);
    attachRealtimeServer(server); // same wiring server.ts does — the router alone has no WS upgrade handler
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("broadcasts nothing for a fully-suppressed order, and does broadcast for a normal one", async () => {
    const received: Array<{ type: string }> = [];
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));

    const suppressedOrderNumber = `TEST-SUPPRESSED-${Date.now()}`;
    const suppressedRes = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: suppressedOrderNumber,
        table: "Bar 1",
        server: "Sam",
        originStation: "BAR",
        items: [{ name: "Margarita", quantity: 1, modifiers: [], station: "BAR" }],
      }),
    });
    expect(suppressedRes.status).toBe(200);
    expect(await suppressedRes.json()).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toEqual([]);

    // Control: a normal order DOES broadcast — proves the WS listener works,
    // so the empty result above means "nothing sent", not "nothing heard".
    const normalOrderNumber = `TEST-CONTROL-${Date.now()}`;
    const normalRes = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: normalOrderNumber,
        table: "5",
        server: "Sam",
        items: [{ name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" }],
      }),
    });
    expect(normalRes.status).toBe(201);
    const tickets = (await normalRes.json()) as Array<{ orderId: string }>;

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("ORDER_CREATED");

    ws.close();
    await cleanupOrder(tickets[0].orderId);
  });
});

/**
 * Step 7: HTTP-level proof of the REFIRE creation endpoint — 404s for a bad
 * source, and that creation broadcasts exactly one STATION_TICKET_UPDATED
 * over a real WebSocket connection, the same as any other ticket mutation.
 */
describe("POST /api/tickets/:ticketId/items/:itemId/refire", () => {
  let server: Server;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", apiRouter);
    server = app.listen(0);
    attachRealtimeServer(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function createSourceOrder() {
    const orderNumber = `TEST-REFIRE-SRC-${Date.now()}-${Math.random()}`;
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber,
        table: "10",
        server: "Alex",
        items: [{ name: "Dallas Filet", quantity: 1, modifiers: ["Medium Rare"], station: "BROIL" }],
      }),
    });
    const tickets = (await res.json()) as Array<{
      id: string;
      orderId: string;
      items: Array<{ id: string }>;
    }>;
    return tickets[0];
  }

  it("returns 404 for a nonexistent ticket", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/does-not-exist/items/does-not-exist/refire`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the item does not belong to the ticket", async () => {
    const ticket = await createSourceOrder();

    const res = await fetch(`${baseUrl}/api/tickets/${ticket.id}/items/not-a-real-item/refire`, {
      method: "POST",
    });

    expect(res.status).toBe(404);
    await cleanupOrder(ticket.orderId);
  });

  it("creates a refire, returns 201, and broadcasts exactly one STATION_TICKET_UPDATED", async () => {
    const ticket = await createSourceOrder();
    const itemId = ticket.items[0].id;

    const received: Array<{ type: string; ticket?: { id: string; refire?: unknown } }> = [];
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));

    const res = await fetch(`${baseUrl}/api/tickets/${ticket.id}/items/${itemId}/refire`, {
      method: "POST",
    });

    expect(res.status).toBe(201);
    const refireTicket = (await res.json()) as {
      id: string;
      items: Array<{ id: string }>;
      refire: { originTicketId: string; originItemId: string };
    };
    expect(refireTicket.id).not.toBe(ticket.id);
    expect(refireTicket.items[0].id).not.toBe(itemId);
    expect(refireTicket.refire).toEqual({ originTicketId: ticket.id, originItemId: itemId });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("STATION_TICKET_UPDATED");
    expect(received[0].ticket?.id).toBe(refireTicket.id);

    ws.close();
    await cleanupOrder(ticket.orderId);
  });
});
