import type { Station } from "./station";

export type ItemStatus = "PENDING" | "READY";

/**
 * A single line on a restaurant order. `station` is what lets the routing
 * layer split one order into per-station tickets.
 */
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  modifiers: string[];
  station: Station;
  status: ItemStatus;
  /** When the line was fired to the kitchen. Drives the ticket's elapsed timer. */
  sentAt: Date;
  /** Set when the cook marks the line READY; cleared when completion is undone. */
  completedAt?: Date;
}

/** The full restaurant order, spanning every station. */
export interface Order {
  id: string;
  orderNumber: string;
  table: string;
  server: string;
  createdAt: Date;
  items: OrderItem[];
}

export function isItemReady(item: OrderItem): boolean {
  return item.status === "READY";
}
