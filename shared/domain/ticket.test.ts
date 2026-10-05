import { describe, expect, it } from "vitest";
import { byBoardPriority, isRefireTicket, type StationTicket } from "./ticket";

const BASE_TIME = new Date("2026-01-01T18:00:00.000Z");

function makeTicket(overrides: Partial<StationTicket> & Pick<StationTicket, "id">): StationTicket {
  return {
    orderId: `order-${overrides.id}`,
    orderNumber: "1000",
    table: "1",
    server: "Sam",
    station: "BROIL",
    items: [],
    status: "ACTIVE",
    createdAt: BASE_TIME,
    ...overrides,
  };
}

describe("isRefireTicket", () => {
  it("is false for a normal ticket (refire undefined)", () => {
    expect(isRefireTicket(makeTicket({ id: "t1" }))).toBe(false);
  });

  it("is true once refire provenance is present", () => {
    const ticket = makeTicket({
      id: "t1",
      refire: { originTicketId: "origin-ticket", originItemId: "origin-item" },
    });
    expect(isRefireTicket(ticket)).toBe(true);
  });
});

describe("byBoardPriority", () => {
  it("puts a REFIRE ticket before a normal ticket regardless of age", () => {
    const oldCriticalNormal = makeTicket({
      id: "normal",
      createdAt: new Date(BASE_TIME.getTime() - 14 * 60_000), // 14 minutes old
    });
    const freshRefire = makeTicket({
      id: "refire",
      createdAt: new Date(BASE_TIME.getTime() - 5_000), // 5 seconds old
      refire: { originTicketId: "origin-ticket", originItemId: "origin-item" },
    });

    const sorted = [oldCriticalNormal, freshRefire].sort(byBoardPriority);

    expect(sorted.map((t) => t.id)).toEqual(["refire", "normal"]);
  });

  it("sorts multiple REFIRE tickets oldest-first among themselves", () => {
    const refireOld = makeTicket({
      id: "refire-old",
      createdAt: new Date(BASE_TIME.getTime() - 60_000),
      refire: { originTicketId: "o1", originItemId: "i1" },
    });
    const refireNew = makeTicket({
      id: "refire-new",
      createdAt: BASE_TIME,
      refire: { originTicketId: "o2", originItemId: "i2" },
    });

    const sorted = [refireNew, refireOld].sort(byBoardPriority);

    expect(sorted.map((t) => t.id)).toEqual(["refire-old", "refire-new"]);
  });

  it("preserves oldest-first ordering among normal tickets", () => {
    const older = makeTicket({ id: "older", createdAt: new Date(BASE_TIME.getTime() - 60_000) });
    const newer = makeTicket({ id: "newer", createdAt: BASE_TIME });

    const sorted = [newer, older].sort(byBoardPriority);

    expect(sorted.map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("mixed board: all REFIRE first (oldest-first), then all normal (oldest-first)", () => {
    const normalOld = makeTicket({ id: "normal-old", createdAt: new Date(BASE_TIME.getTime() - 120_000) });
    const normalNew = makeTicket({ id: "normal-new", createdAt: new Date(BASE_TIME.getTime() - 30_000) });
    const refireOld = makeTicket({
      id: "refire-old",
      createdAt: new Date(BASE_TIME.getTime() - 90_000),
      refire: { originTicketId: "o1", originItemId: "i1" },
    });
    const refireNew = makeTicket({
      id: "refire-new",
      createdAt: BASE_TIME,
      refire: { originTicketId: "o2", originItemId: "i2" },
    });

    const sorted = [normalNew, refireNew, normalOld, refireOld].sort(byBoardPriority);

    expect(sorted.map((t) => t.id)).toEqual([
      "refire-old",
      "refire-new",
      "normal-old",
      "normal-new",
    ]);
  });
});
