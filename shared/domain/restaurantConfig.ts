import { isProductionStation, type ProductionStation } from "./station";

/**
 * What a specific restaurant deployment actually uses, layered on top of the
 * structural `ProductionStation` set every deployment shares. Two concerns,
 * kept separate on purpose:
 *
 *  - `enabledProductionStations` — which production stations this restaurant
 *    routes items to at all. A structurally valid `ProductionStation` (e.g.
 *    `BAR`) that isn't in this list is rejected at ingestion, same as an
 *    unrecognized station.
 *  - `expoProductionStations` — of the enabled stations, which ones Window
 *    aggregates and waits on. A station can be enabled without participating
 *    in Expo (BAR is the motivating case: a service-bar display is a real
 *    production station, but Window has no business showing drink tickets
 *    or waiting on the bartender to bump).
 *
 * Domain/validation/Expo logic takes a `RestaurantStationConfig` as an
 * explicit parameter rather than reaching for a global — `ACTIVE_RESTAURANT_CONFIG`
 * (below) is just the value used at today's few call sites
 * (`backend/src/api/router.ts`, `frontend/src/components/kds/WindowPage.tsx`).
 * Swapping in a different restaurant's config later means changing what
 * value those sites pass, not rewriting any domain logic.
 */
export interface RestaurantStationConfig {
  enabledProductionStations: readonly ProductionStation[];
  expoProductionStations: readonly ProductionStation[];
}

/** A restaurant with no service bar. BAR is structurally available (see
 *  `ProductionStation`) but not enabled here at all. */
export const DEFAULT_RESTAURANT_CONFIG: RestaurantStationConfig = {
  enabledProductionStations: ["BROIL", "FRY", "SALAD", "HOT_SIDE"],
  expoProductionStations: ["BROIL", "FRY", "SALAD", "HOT_SIDE"],
};

/** A restaurant with a service bar. BAR routes real tickets and gets its own
 *  screen, but stays outside Expo — Window never shows or waits on it. */
export const BAR_ENABLED_CONFIG: RestaurantStationConfig = {
  enabledProductionStations: ["BROIL", "FRY", "SALAD", "HOT_SIDE", "BAR"],
  expoProductionStations: ["BROIL", "FRY", "SALAD", "HOT_SIDE"],
};

/**
 * The config actually wired into this running deployment — the ONE thing
 * `router.ts` and `WindowPage.tsx` import, so switching which named config is
 * live is a one-line change here, not scattered edits at every call site.
 *
 * Step 6A: this repo's dev/demo deployment runs BAR-enabled, to prove the
 * detachable architecture end-to-end. `DEFAULT_RESTAURANT_CONFIG` is
 * untouched and still a fully legitimate, independently usable config for a
 * restaurant with no bar — swap this alias back to it (or to a real
 * per-deployment config source, later) without touching any call site.
 */
export const ACTIVE_RESTAURANT_CONFIG: RestaurantStationConfig = BAR_ENABLED_CONFIG;

/**
 * A station value is usable on an incoming order (as an item's station, or
 * as `originStation`) only if it's BOTH structurally a real production
 * station (WINDOW is a `Station` but never one — see `isProductionStation`)
 * AND enabled for this restaurant (a structurally-valid-but-disabled
 * station, e.g. `BAR` on a no-bar deployment, doesn't count either). The one
 * enablement rule every order-ingestion boundary shares — the HTTP API
 * (`backend/src/api/router.ts`) and the seed script
 * (`backend/src/seed/seedData.ts`) both call this rather than re-deriving it,
 * so a seed order can never create a ticket the live API would have rejected.
 */
export function isEnabledProductionStation(
  value: string,
  config: RestaurantStationConfig,
): value is ProductionStation {
  return (
    isProductionStation(value) &&
    config.enabledProductionStations.some((enabled) => enabled === value)
  );
}
