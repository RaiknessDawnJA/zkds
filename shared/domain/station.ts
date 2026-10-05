/**
 * The kitchen stations this KDS serves. Shared between frontend and backend
 * so routing/validation logic never has two independently-typed opinions of
 * what a Station is.
 */
export type Station = "BROIL" | "FRY" | "SALAD" | "HOT_SIDE" | "BAR" | "WINDOW";

export const STATIONS: readonly Station[] = [
  "BROIL",
  "FRY",
  "SALAD",
  "HOT_SIDE",
  "BAR",
  "WINDOW",
] as const;

export const STATION_LABELS: Record<Station, string> = {
  BROIL: "BROIL",
  FRY: "FRY",
  SALAD: "SALAD / COLD",
  HOT_SIDE: "HOT SIDE",
  BAR: "BAR",
  WINDOW: "WINDOW / EXPO",
};

export function isStation(value: string): value is Station {
  return (STATIONS as readonly string[]).includes(value);
}

/**
 * The stations that actually cook/prep food (or drinks) and generate a
 * StationTicket someone works. `WINDOW` is deliberately excluded: it's
 * Expo's own screen identity (`STATION_LABELS.WINDOW`, `/station/window`),
 * not a production station — an order item routed to "WINDOW" would produce
 * a StationTicket nothing ever bumps, leaving that order permanently stuck.
 * Ingestion (`NormalizedOrderItem.station`) is typed and validated against
 * this narrower set specifically to make that impossible.
 *
 * This is the STRUCTURAL set — every station this codebase knows how to
 * route to, regardless of whether a given restaurant deployment actually
 * uses it. Which of these a specific restaurant has enabled/exposes to Expo
 * is a separate, runtime concern — see `RestaurantStationConfig`.
 */
export type ProductionStation = Exclude<Station, "WINDOW">;

export const PRODUCTION_STATIONS: readonly ProductionStation[] = [
  "BROIL",
  "FRY",
  "SALAD",
  "HOT_SIDE",
  "BAR",
] as const;

export function isProductionStation(value: string): value is ProductionStation {
  return (PRODUCTION_STATIONS as readonly string[]).includes(value);
}
