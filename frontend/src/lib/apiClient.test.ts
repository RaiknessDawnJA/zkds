import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedOrder } from "@zkds/shared";
import type { StationAction } from "@/state/actions";
import {
  createRefire,
  fetchSnapshot,
  postNormalizedOrder,
  reviveKitchenEvent,
  sendStationAction,
} from "./apiClient";

const BASE_TIME = "2026-01-01T18:00:00.000Z";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchSnapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("revives every timestamp field back into a real Date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          tickets: [
            {
              id: "t1",
              orderId: "o1",
              orderNumber: "1048",
              table: "18",
              server: "Maria",
              station: "BROIL",
              status: "BUMPED",
              createdAt: BASE_TIME,
              bumpedAt: BASE_TIME,
              items: [
                {
                  id: "i1",
                  name: "Ribeye",
                  quantity: 1,
                  modifiers: [],
                  station: "BROIL",
                  status: "READY",
                  sentAt: BASE_TIME,
                  completedAt: BASE_TIME,
                },
              ],
            },
          ],
          expoOrders: { o1: { status: "BUMPED", bumpedAt: BASE_TIME } },
        }),
      ),
    );

    const snapshot = await fetchSnapshot();

    expect(snapshot.tickets[0].createdAt).toBeInstanceOf(Date);
    expect(snapshot.tickets[0].bumpedAt).toBeInstanceOf(Date);
    expect(snapshot.tickets[0].items[0].sentAt).toBeInstanceOf(Date);
    expect(snapshot.tickets[0].items[0].completedAt).toBeInstanceOf(Date);
    expect(snapshot.expoOrders.o1.bumpedAt).toBeInstanceOf(Date);
  });

  it("leaves optional timestamps undefined rather than inventing a Date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          tickets: [
            {
              id: "t1",
              orderId: "o1",
              orderNumber: "1048",
              table: "18",
              server: "Maria",
              station: "BROIL",
              status: "ACTIVE",
              createdAt: BASE_TIME,
              items: [
                {
                  id: "i1",
                  name: "Ribeye",
                  quantity: 1,
                  modifiers: [],
                  station: "BROIL",
                  status: "PENDING",
                  sentAt: BASE_TIME,
                },
              ],
            },
          ],
          expoOrders: {},
        }),
      ),
    );

    const snapshot = await fetchSnapshot();
    expect(snapshot.tickets[0].bumpedAt).toBeUndefined();
    expect(snapshot.tickets[0].items[0].completedAt).toBeUndefined();
  });

  it("throws when the backend responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(fetchSnapshot()).rejects.toThrow();
  });
});

describe("sendStationAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each<[StationAction, string]>([
    [
      { type: "COMPLETE_ITEM", ticketId: "t1", itemId: "i1", at: new Date() },
      "/api/tickets/t1/items/i1/complete",
    ],
    [
      { type: "UNCOMPLETE_ITEM", ticketId: "t1", itemId: "i1" },
      "/api/tickets/t1/items/i1/uncomplete",
    ],
    [{ type: "BUMP_TICKET", ticketId: "t1", at: new Date() }, "/api/tickets/t1/bump"],
    [{ type: "RECALL_TICKET", ticketId: "t1", at: new Date() }, "/api/tickets/t1/recall"],
    [
      { type: "WINDOW_BUMP_ORDER", orderId: "o1", at: new Date() },
      "/api/orders/o1/expo/bump",
    ],
    [
      { type: "WINDOW_RECALL_ORDER", orderId: "o1", at: new Date() },
      "/api/orders/o1/expo/recall",
    ],
  ])("maps %o to POST %s", async (action, expectedPath) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendStationAction(action);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(expectedPath);
    expect(init.method).toBe("POST");
  });

  it("throws with the server's error message when a mutation is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "NOT_READY" }, false, 409)),
    );

    await expect(
      sendStationAction({ type: "WINDOW_BUMP_ORDER", orderId: "o1", at: new Date() }),
    ).rejects.toThrow(/NOT_READY/);
  });
});

describe("postNormalizedOrder", () => {
  afterEach(() => vi.unstubAllGlobals());

  const order: NormalizedOrder = {
    orderNumber: "MOCK-1",
    table: "Mock 1",
    server: "Mock POS",
    createdAt: new Date(BASE_TIME),
    items: [{ name: "Ribeye", quantity: 1, modifiers: [], station: "BROIL" }],
  };

  it("posts to /api/orders and revives dates on a 201 (tickets created)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        [
          {
            id: "o1-BROIL",
            orderId: "o1",
            orderNumber: "MOCK-1",
            table: "Mock 1",
            server: "Mock POS",
            station: "BROIL",
            status: "ACTIVE",
            createdAt: BASE_TIME,
            items: [],
          },
        ],
        true,
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postNormalizedOrder(order);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/orders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ orderNumber: "MOCK-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requiredKdsWork).toBe(true);
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].createdAt).toBeInstanceOf(Date);
    }
  });

  it("treats 200 + [] as success with requiredKdsWork: false, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([], true, 200)));

    const result = await postNormalizedOrder(order);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requiredKdsWork).toBe(false);
      expect(result.tickets).toEqual([]);
    }
  });

  it("surfaces a 400 validation rejection with the backend's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid order payload" }, false, 400)),
    );

    const result = await postNormalizedOrder(order);

    expect(result).toEqual({
      ok: false,
      reason: "validation",
      message: "Invalid order payload",
    });
  });

  it("surfaces a network/fetch failure cleanly instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("fetch failed")),
    );

    const result = await postNormalizedOrder(order);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("network");
      expect(result.message).toContain("fetch failed");
    }
  });
});

describe("createRefire", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the refire endpoint and revives dates on the created ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: "refire-1",
          orderId: "o1",
          orderNumber: "1048",
          table: "18",
          server: "Maria",
          station: "BROIL",
          status: "ACTIVE",
          createdAt: BASE_TIME,
          items: [
            {
              id: "refire-item-1",
              name: "Dallas Filet",
              quantity: 1,
              modifiers: ["Medium Rare"],
              station: "BROIL",
              status: "PENDING",
              sentAt: BASE_TIME,
            },
          ],
          refire: { originTicketId: "t1", originItemId: "i1" },
        },
        true,
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const ticket = await createRefire("t1", "i1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/tickets/t1/items/i1/refire");
    expect(init.method).toBe("POST");

    expect(ticket.createdAt).toBeInstanceOf(Date);
    expect(ticket.refire).toEqual({ originTicketId: "t1", originItemId: "i1" });
    expect(ticket.items[0].id).toBe("refire-item-1");
  });

  it("throws with the server's error message when refire is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "ITEM_NOT_FOUND" }, false, 404)),
    );

    await expect(createRefire("t1", "bad-item")).rejects.toThrow(/ITEM_NOT_FOUND/);
  });
});

describe("reviveKitchenEvent", () => {
  it("revives dates inside a STATION_TICKET_UPDATED event", () => {
    const event = reviveKitchenEvent({
      type: "STATION_TICKET_UPDATED",
      ticket: {
        id: "t1",
        orderId: "o1",
        orderNumber: "1048",
        table: "18",
        server: "Maria",
        station: "BROIL",
        status: "BUMPED",
        createdAt: BASE_TIME,
        bumpedAt: BASE_TIME,
        items: [],
      },
    } as never);

    expect(event.type).toBe("STATION_TICKET_UPDATED");
    if (event.type === "STATION_TICKET_UPDATED") {
      expect(event.ticket.createdAt).toBeInstanceOf(Date);
      expect(event.ticket.bumpedAt).toBeInstanceOf(Date);
    }
  });
});
