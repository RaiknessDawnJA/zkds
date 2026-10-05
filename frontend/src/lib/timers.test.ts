import { describe, expect, it } from "vitest";
import { elapsedMsSince, formatElapsed } from "./timers";

describe("elapsedMsSince", () => {
  it("measures forward from the start timestamp", () => {
    const start = new Date("2026-01-01T18:00:00Z");
    expect(elapsedMsSince(start, start.getTime() + 90_000)).toBe(90_000);
  });

  it("clamps to zero for a start timestamp in the future", () => {
    const start = new Date("2026-01-01T18:00:00Z");
    expect(elapsedMsSince(start, start.getTime() - 5_000)).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("formats as MM:SS", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9_000)).toBe("00:09");
    expect(formatElapsed(134_000)).toBe("02:14");
    expect(formatElapsed(403_000)).toBe("06:43");
    expect(formatElapsed(627_000)).toBe("10:27");
  });

  it("keeps counting past ten minutes without rolling over", () => {
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("widens to H:MM:SS once past an hour", () => {
    expect(formatElapsed(60 * 60_000)).toBe("1:00:00");
    expect(formatElapsed(3 * 60 * 60_000 + 7 * 60_000 + 5_000)).toBe("3:07:05");
  });
});
