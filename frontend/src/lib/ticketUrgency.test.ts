import { describe, expect, it } from "vitest";
import type { StationTicket } from "@zkds/shared";
import {
  getTicketUrgency,
  getTicketUrgencyAt,
  ticketThresholds,
} from "./ticketUrgency";

const minutes = (value: number) => value * 60_000;

describe("getTicketUrgency", () => {
  it("is NORMAL from 0:00 to 4:59", () => {
    expect(getTicketUrgency(0)).toBe("NORMAL");
    expect(getTicketUrgency(minutes(4) + 59_000)).toBe("NORMAL");
  });

  it("is WARNING from 5:00 to 7:59", () => {
    expect(getTicketUrgency(minutes(5))).toBe("WARNING");
    expect(getTicketUrgency(minutes(7) + 59_000)).toBe("WARNING");
  });

  it("is LATE from 8:00 to 11:59", () => {
    expect(getTicketUrgency(minutes(8))).toBe("LATE");
    expect(getTicketUrgency(minutes(11) + 59_000)).toBe("LATE");
  });

  it("is CRITICAL from 12:00 onward", () => {
    expect(getTicketUrgency(minutes(12))).toBe("CRITICAL");
    expect(getTicketUrgency(minutes(45))).toBe("CRITICAL");
  });

  it("honours custom thresholds instead of the defaults", () => {
    const strict = { warningMinutes: 1, lateMinutes: 2, criticalMinutes: 3 };
    expect(getTicketUrgency(minutes(1), strict)).toBe("WARNING");
    expect(getTicketUrgency(minutes(3), strict)).toBe("CRITICAL");
    // Same elapsed time is still NORMAL under the shipped thresholds.
    expect(getTicketUrgency(minutes(3), ticketThresholds)).toBe("NORMAL");
  });
});

describe("getTicketUrgencyAt", () => {
  it("derives urgency from the ticket timestamp and escalates as time passes", () => {
    const createdAt = new Date("2026-01-01T18:00:00Z");
    const ticket = { createdAt } as StationTicket;

    expect(getTicketUrgencyAt(ticket, createdAt.getTime())).toBe("NORMAL");
    expect(getTicketUrgencyAt(ticket, createdAt.getTime() + minutes(6))).toBe(
      "WARNING",
    );
    expect(getTicketUrgencyAt(ticket, createdAt.getTime() + minutes(9))).toBe(
      "LATE",
    );
    expect(getTicketUrgencyAt(ticket, createdAt.getTime() + minutes(13))).toBe(
      "CRITICAL",
    );
  });
});
