import { describe, expect, it } from "vitest";
import { BAR_ENABLED_CONFIG, DEFAULT_RESTAURANT_CONFIG } from "@zkds/shared";
import { BASE_TIME, makeItem, makeTicket } from "@/test/factories";
import { buildOrderSummaries, selectExpoParticipatingTickets } from "./orderSummary";

describe("buildOrderSummaries", () => {
  it("groups tickets from different stations under the same order", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "1048-BROIL",
        orderId: "order-1048",
        orderNumber: "1048",
        station: "BROIL",
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "1048-FRY",
        orderId: "order-1048",
        orderNumber: "1048",
        station: "FRY",
        items: [makeItem({ id: "i2", name: "Fried Pickles", station: "FRY" })],
      }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].orderId).toBe("order-1048");
    expect(summaries[0].stations.map((s) => s.station)).toEqual([
      "BROIL",
      "FRY",
    ]);
  });

  it("marks a station ready only once its ticket is BUMPED", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t1",
        orderId: "order-1",
        station: "BROIL",
        status: "BUMPED",
        bumpedAt: BASE_TIME,
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "t2",
        orderId: "order-1",
        station: "FRY",
        status: "ACTIVE",
        items: [makeItem({ id: "i2", name: "Fries", station: "FRY" })],
      }),
    ]);

    const [broil, fry] = summaries[0].stations;
    expect(broil.ready).toBe(true);
    expect(fry.ready).toBe(false);
    expect(summaries[0].waitingOn).toEqual(["FRY"]);
  });

  it("treats a RECALLED ticket as not ready again", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t1",
        orderId: "order-1",
        station: "FRY",
        status: "RECALLED",
        bumpedAt: BASE_TIME,
        recalledAt: new Date(BASE_TIME.getTime() + 60_000),
        items: [makeItem({ id: "i1", name: "Fries", station: "FRY" })],
      }),
    ]);

    expect(summaries[0].stations[0].ready).toBe(false);
    expect(summaries[0].waitingOn).toEqual(["FRY"]);
  });

  it("has an empty waitingOn once every station is bumped", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t1",
        orderId: "order-1",
        station: "BROIL",
        status: "BUMPED",
        bumpedAt: BASE_TIME,
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "t2",
        orderId: "order-1",
        station: "FRY",
        status: "BUMPED",
        bumpedAt: BASE_TIME,
        items: [makeItem({ id: "i2", name: "Fries", station: "FRY" })],
      }),
    ]);

    expect(summaries[0].waitingOn).toEqual([]);
  });

  it("orders stations within a card by canonical station order, not ticket order", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t-window",
        orderId: "order-1",
        station: "WINDOW",
        items: [makeItem({ id: "i1", name: "Expo note", station: "WINDOW" })],
      }),
      makeTicket({
        id: "t-broil",
        orderId: "order-1",
        station: "BROIL",
        items: [makeItem({ id: "i2", name: "Ribeye" })],
      }),
      makeTicket({
        id: "t-fry",
        orderId: "order-1",
        station: "FRY",
        items: [makeItem({ id: "i3", name: "Fries", station: "FRY" })],
      }),
    ]);

    expect(summaries[0].stations.map((s) => s.station)).toEqual([
      "BROIL",
      "FRY",
      "WINDOW",
    ]);
  });

  it("sorts orders oldest-first by their earliest ticket", () => {
    const older = new Date(BASE_TIME.getTime() - 10 * 60_000);

    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t-new",
        orderId: "order-new",
        orderNumber: "2000",
        createdAt: BASE_TIME,
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "t-old",
        orderId: "order-old",
        orderNumber: "1000",
        createdAt: older,
        items: [makeItem({ id: "i2", name: "Ribs" })],
      }),
    ]);

    expect(summaries.map((s) => s.orderNumber)).toEqual(["1000", "2000"]);
  });

  it("returns nothing for an empty ticket list", () => {
    expect(buildOrderSummaries([])).toEqual([]);
  });

  it("carries each station's ticketId, so a caller can dispatch item toggles against the right ticket", () => {
    const summaries = buildOrderSummaries([
      makeTicket({
        id: "1048-BROIL",
        orderId: "order-1048",
        station: "BROIL",
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "1048-FRY",
        orderId: "order-1048",
        station: "FRY",
        items: [makeItem({ id: "i2", name: "Fries", station: "FRY" })],
      }),
    ]);

    const [broil, fry] = summaries[0].stations;
    expect(broil.ticketId).toBe("1048-BROIL");
    expect(fry.ticketId).toBe("1048-FRY");
  });

  it("exposes the order's earliest ticket time as createdAt, for Window's own timer", () => {
    const earlier = new Date(BASE_TIME.getTime() - 5 * 60_000);

    const summaries = buildOrderSummaries([
      makeTicket({
        id: "t1",
        orderId: "order-1",
        station: "BROIL",
        createdAt: BASE_TIME,
        items: [makeItem({ id: "i1", name: "Ribeye" })],
      }),
      makeTicket({
        id: "t2",
        orderId: "order-1",
        station: "FRY",
        createdAt: earlier,
        items: [makeItem({ id: "i2", name: "Fries", station: "FRY" })],
      }),
    ]);

    expect(summaries[0].createdAt).toEqual(earlier);
  });
});

describe("selectExpoParticipatingTickets", () => {
  it("keeps tickets on Expo-participating stations and drops the rest", () => {
    const broil = makeTicket({ id: "t-broil", orderId: "order-1", station: "BROIL" });
    const bar = makeTicket({ id: "t-bar", orderId: "order-1", station: "BAR" });

    const kept = selectExpoParticipatingTickets([broil, bar], BAR_ENABLED_CONFIG);

    expect(kept).toEqual([broil]);
  });

  it("drops every ticket for a BAR-only order, leaving nothing for that order", () => {
    const bar = makeTicket({ id: "t-bar", orderId: "order-1", station: "BAR" });

    expect(selectExpoParticipatingTickets([bar], BAR_ENABLED_CONFIG)).toEqual([]);
  });
});

describe("buildOrderSummaries + selectExpoParticipatingTickets (BAR-only order)", () => {
  it("a BAR-only order never produces a summary at all — not an empty one", () => {
    const bar = makeTicket({
      id: "t-bar",
      orderId: "order-bar-only",
      station: "BAR",
      items: [makeItem({ id: "i1", name: "Margarita", station: "BAR" })],
    });

    const summaries = buildOrderSummaries(
      selectExpoParticipatingTickets([bar], BAR_ENABLED_CONFIG),
    );

    expect(summaries).toEqual([]);
  });

  it("a mixed BROIL+BAR order appears with only the BROIL section, and BAR never blocks readiness", () => {
    const broil = makeTicket({
      id: "t-broil",
      orderId: "order-mixed",
      station: "BROIL",
      status: "BUMPED",
      bumpedAt: BASE_TIME,
      items: [makeItem({ id: "i1", name: "Ribeye" })],
    });
    const bar = makeTicket({
      id: "t-bar",
      orderId: "order-mixed",
      station: "BAR",
      // Deliberately NOT bumped — must not matter for Expo readiness.
      items: [makeItem({ id: "i2", name: "Margarita", station: "BAR" })],
    });

    // The BAR ticket is real production data — StationPage would show it on
    // /station/bar exactly like any other ticket — it's only Window's own
    // aggregation that excludes it.
    expect(bar.station).toBe("BAR");
    expect(bar.items[0].name).toBe("Margarita");

    const summaries = buildOrderSummaries(
      selectExpoParticipatingTickets([broil, bar], BAR_ENABLED_CONFIG),
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].stations.map((s) => s.station)).toEqual(["BROIL"]);
    expect(summaries[0].waitingOn).toEqual([]);
  });
});

describe("selectExpoParticipatingTickets — REFIRE exclusion (Step 7)", () => {
  it("excludes a REFIRE ticket even on an otherwise Expo-participating station (BROIL)", () => {
    const normalBroil = makeTicket({ id: "t-broil", orderId: "order-1", station: "BROIL" });
    const refireBroil = makeTicket({
      id: "t-refire",
      orderId: "order-1",
      station: "BROIL",
      refire: { originTicketId: "t-broil", originItemId: "i-origin" },
    });

    const kept = selectExpoParticipatingTickets(
      [normalBroil, refireBroil],
      DEFAULT_RESTAURANT_CONFIG,
    );

    expect(kept).toEqual([normalBroil]);
  });

  it("a REFIRE-only order (no normal ticket at all) never produces a Window summary", () => {
    const refireOnly = makeTicket({
      id: "t-refire",
      orderId: "order-refire-only",
      station: "BROIL",
      items: [makeItem({ id: "i1", name: "Dallas Filet" })],
      refire: { originTicketId: "some-other-ticket", originItemId: "some-other-item" },
    });

    const summaries = buildOrderSummaries(
      selectExpoParticipatingTickets([refireOnly], DEFAULT_RESTAURANT_CONFIG),
    );

    expect(summaries).toEqual([]);
  });

  it("an active REFIRE never enters waitingOn, and never blocks Window BUMP eligibility", () => {
    const broil = makeTicket({
      id: "t-broil",
      orderId: "order-1",
      station: "BROIL",
      status: "BUMPED",
      bumpedAt: BASE_TIME,
      items: [makeItem({ id: "i1", name: "Ribeye" })],
    });
    const refire = makeTicket({
      id: "t-refire",
      orderId: "order-1",
      station: "BROIL",
      // Deliberately still ACTIVE/unbumped — must not matter.
      items: [makeItem({ id: "i2", name: "Dallas Filet" })],
      refire: { originTicketId: "t-broil", originItemId: "i-origin" },
    });

    const summaries = buildOrderSummaries(
      selectExpoParticipatingTickets([broil, refire], DEFAULT_RESTAURANT_CONFIG),
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].waitingOn).toEqual([]);
  });
});
