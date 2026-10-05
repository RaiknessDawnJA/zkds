import type { ProductionStation } from "./station";

/**
 * The one POS-neutral shape every order source normalizes into before it ever
 * reaches our domain — a Mock POS, standalone mode, or a future Square/Toast/
 * Aloha adapter all produce this same contract. Nothing vendor-specific
 * (Square SDK types, Toast types, etc.) belongs anywhere near it.
 *
 * This is intentionally NOT the same shape as our internal `Order`/
 * `OrderItem`: those carry our own generated ids and runtime status
 * (PENDING/READY, ACTIVE/BUMPED/...) that a POS has no business supplying —
 * a normalized order always arrives fresh, and ingestion is what assigns ids
 * and starts every item at PENDING.
 *
 * `station` is `ProductionStation`, not the broader `Station` union: an
 * incoming order item can only target a station that actually cooks/preps
 * food. `WINDOW` is Expo's own screen identity, never a routing target for
 * an order item — see `ProductionStation`'s doc comment.
 */
export interface NormalizedOrderItem {
  name: string;
  quantity: number;
  modifiers: string[];
  station: ProductionStation;
}

export interface NormalizedOrder {
  orderNumber: string;
  table: string;
  server: string;
  /** Adapters should supply the real fire time; ingestion falls back to "now"
   *  if omitted (e.g. a live Mock POS firing an order this instant). */
  createdAt?: Date;
  /**
   * The production station this order was opened/served directly at, if any
   * — e.g. a guest seated at the bar, ordering straight from the bartender.
   * Vendor-neutral: any POS/adapter normalizes its own dining-area/revenue-
   * center concept into this field. When set, items whose station matches it
   * don't get a StationTicket on that station's own KDS display — that
   * station's staff already has the guest in front of them. Omitted (the
   * common case) means a normal dining-room order: nothing is suppressed.
   */
  originStation?: ProductionStation;
  items: NormalizedOrderItem[];
}
