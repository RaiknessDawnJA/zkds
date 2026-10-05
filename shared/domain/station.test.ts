import { describe, expect, it } from "vitest";
import { isProductionStation, isStation, PRODUCTION_STATIONS, STATIONS } from "./station";

describe("isStation", () => {
  it("accepts every station, including WINDOW", () => {
    for (const station of STATIONS) {
      expect(isStation(station)).toBe(true);
    }
  });

  it("rejects anything outside the Station union", () => {
    expect(isStation("GRILL")).toBe(false);
    expect(isStation("")).toBe(false);
  });
});

describe("isProductionStation", () => {
  it("accepts BROIL, FRY, SALAD, HOT_SIDE, and BAR — the structural set", () => {
    for (const station of PRODUCTION_STATIONS) {
      expect(isProductionStation(station)).toBe(true);
    }
    expect(PRODUCTION_STATIONS).toEqual([
      "BROIL",
      "FRY",
      "SALAD",
      "HOT_SIDE",
      "BAR",
    ]);
  });

  it("rejects WINDOW — it's Expo's screen identity, not a production station", () => {
    expect(isProductionStation("WINDOW")).toBe(false);
  });

  it("rejects anything outside the Station union too", () => {
    expect(isProductionStation("GRILL")).toBe(false);
    expect(isProductionStation("")).toBe(false);
  });
});
