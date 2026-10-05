import { describe, expect, it } from "vitest";
import {
  ACTIVE_RESTAURANT_CONFIG,
  BAR_ENABLED_CONFIG,
  DEFAULT_RESTAURANT_CONFIG,
  isEnabledProductionStation,
} from "./restaurantConfig";

describe("DEFAULT_RESTAURANT_CONFIG", () => {
  it("enables only BROIL, FRY, SALAD, and HOT_SIDE — BAR is off by default", () => {
    expect(DEFAULT_RESTAURANT_CONFIG.enabledProductionStations).toEqual([
      "BROIL",
      "FRY",
      "SALAD",
      "HOT_SIDE",
    ]);
  });

  it("has every enabled station participating in Expo by default", () => {
    expect(DEFAULT_RESTAURANT_CONFIG.expoProductionStations).toEqual(
      DEFAULT_RESTAURANT_CONFIG.enabledProductionStations,
    );
  });

  it("does not include BAR anywhere by default", () => {
    expect(DEFAULT_RESTAURANT_CONFIG.enabledProductionStations).not.toContain("BAR");
    expect(DEFAULT_RESTAURANT_CONFIG.expoProductionStations).not.toContain("BAR");
  });
});

describe("BAR_ENABLED_CONFIG", () => {
  it("enables BAR alongside the default four production stations", () => {
    expect(BAR_ENABLED_CONFIG.enabledProductionStations).toEqual([
      "BROIL",
      "FRY",
      "SALAD",
      "HOT_SIDE",
      "BAR",
    ]);
  });

  it("keeps BAR out of Expo — expoProductionStations is unchanged from the default", () => {
    expect(BAR_ENABLED_CONFIG.expoProductionStations).toEqual(
      DEFAULT_RESTAURANT_CONFIG.expoProductionStations,
    );
    expect(BAR_ENABLED_CONFIG.expoProductionStations).not.toContain("BAR");
  });
});

describe("ACTIVE_RESTAURANT_CONFIG", () => {
  it("Step 6A: this deployment runs BAR-enabled — the demo/proof config is active", () => {
    expect(ACTIVE_RESTAURANT_CONFIG).toBe(BAR_ENABLED_CONFIG);
  });
});

describe("isEnabledProductionStation", () => {
  it("accepts BROIL under both configs", () => {
    expect(isEnabledProductionStation("BROIL", DEFAULT_RESTAURANT_CONFIG)).toBe(true);
    expect(isEnabledProductionStation("BROIL", BAR_ENABLED_CONFIG)).toBe(true);
  });

  it("rejects BAR under the default config but accepts it under BAR_ENABLED_CONFIG", () => {
    expect(isEnabledProductionStation("BAR", DEFAULT_RESTAURANT_CONFIG)).toBe(false);
    expect(isEnabledProductionStation("BAR", BAR_ENABLED_CONFIG)).toBe(true);
  });

  it("rejects WINDOW under any config — structurally never a production station", () => {
    expect(isEnabledProductionStation("WINDOW", BAR_ENABLED_CONFIG)).toBe(false);
  });

  it("rejects an unrecognized station under any config", () => {
    expect(isEnabledProductionStation("GRILL", BAR_ENABLED_CONFIG)).toBe(false);
  });
});
