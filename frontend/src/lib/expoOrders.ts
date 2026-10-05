import type { ExpoOrderState, ExpoOrderStatus } from "@zkds/shared";
import type { OrderSummary } from "./orderSummary";

/** How many bumped orders Expo's own RECALL view keeps on screen. Older bumped
 *  orders simply drop out of this list — nothing is deleted from state. */
export const MAX_WINDOW_RECALL_ORDERS = 30;

export interface ExpoOrder extends OrderSummary {
  expoStatus: ExpoOrderStatus;
  expoBumpedAt?: Date;
  expoRecalledAt?: Date;
  /** Derived, not stored — true once every station's ticket is BUMPED. */
  readyForBump: boolean;
}

/**
 * Combines the cross-station OrderSummary view with Expo's own per-order
 * lifecycle. An order with no entry in `expoOrders` is implicitly ACTIVE.
 */
export function buildExpoOrders(
  summaries: OrderSummary[],
  expoOrders: Record<string, ExpoOrderState>,
): ExpoOrder[] {
  return summaries.map((summary) => {
    const expo = expoOrders[summary.orderId];
    return {
      ...summary,
      expoStatus: expo?.status ?? "ACTIVE",
      expoBumpedAt: expo?.bumpedAt,
      expoRecalledAt: expo?.recalledAt,
      readyForBump: summary.waitingOn.length === 0,
    };
  });
}

/** Expo's active board: not yet dispatched, or dispatched then pulled back. */
export function selectActiveExpoOrders(orders: ExpoOrder[]): ExpoOrder[] {
  return orders.filter(
    (order) => order.expoStatus === "ACTIVE" || order.expoStatus === "RECALLED",
  );
}

/** Expo's own recall queue — most recently bumped first, capped for display. */
export function selectRecallExpoOrders(orders: ExpoOrder[]): ExpoOrder[] {
  return orders
    .filter((order) => order.expoStatus === "BUMPED")
    .sort(
      (a, b) => (b.expoBumpedAt?.getTime() ?? 0) - (a.expoBumpedAt?.getTime() ?? 0),
    )
    .slice(0, MAX_WINDOW_RECALL_ORDERS);
}
