import type {
  ExpoOrderState,
  KitchenEvent,
  NormalizedOrder,
  OrderItem,
  StationTicket,
} from "@zkds/shared";
import type { StationAction } from "@/state/actions";

/**
 * Talks to the backend built in Step 5 Phase A. The backend is authoritative
 * for everything here — this module only fetches/parses its responses and
 * sends mutation requests; it never computes a transition itself.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export interface KitchenSnapshot {
  tickets: StationTicket[];
  expoOrders: Record<string, ExpoOrderState>;
}

/** JSON has no Date type — every timestamp arrives as an ISO string and has
 *  to be revived, or every elapsed-time calculation downstream breaks. */
function reviveOrderItem(raw: OrderItem): OrderItem {
  return {
    ...raw,
    sentAt: new Date(raw.sentAt),
    completedAt: raw.completedAt ? new Date(raw.completedAt) : undefined,
  };
}

function reviveStationTicket(raw: StationTicket): StationTicket {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    bumpedAt: raw.bumpedAt ? new Date(raw.bumpedAt) : undefined,
    recalledAt: raw.recalledAt ? new Date(raw.recalledAt) : undefined,
    items: raw.items.map(reviveOrderItem),
  };
}

function reviveExpoOrderState(raw: ExpoOrderState): ExpoOrderState {
  return {
    ...raw,
    bumpedAt: raw.bumpedAt ? new Date(raw.bumpedAt) : undefined,
    recalledAt: raw.recalledAt ? new Date(raw.recalledAt) : undefined,
  };
}

export function reviveKitchenEvent(raw: KitchenEvent): KitchenEvent {
  switch (raw.type) {
    case "STATION_TICKET_UPDATED":
      return { type: "STATION_TICKET_UPDATED", ticket: reviveStationTicket(raw.ticket) };
    case "EXPO_ORDER_UPDATED":
      return {
        type: "EXPO_ORDER_UPDATED",
        orderId: raw.orderId,
        expoOrder: reviveExpoOrderState(raw.expoOrder),
      };
    case "ORDER_CREATED":
      return { type: "ORDER_CREATED", tickets: raw.tickets.map(reviveStationTicket) };
  }
}

export async function fetchSnapshot(): Promise<KitchenSnapshot> {
  const res = await fetch(`${API_BASE_URL}/api/kitchen/snapshot`);
  if (!res.ok) {
    throw new Error(`Failed to load kitchen snapshot: ${res.status}`);
  }
  const raw = (await res.json()) as KitchenSnapshot;

  const expoOrders: Record<string, ExpoOrderState> = {};
  for (const [orderId, state] of Object.entries(raw.expoOrders)) {
    expoOrders[orderId] = reviveExpoOrderState(state);
  }

  return {
    tickets: raw.tickets.map(reviveStationTicket),
    expoOrders,
  };
}

function actionEndpoint(action: StationAction): string {
  switch (action.type) {
    case "COMPLETE_ITEM":
      return `/api/tickets/${action.ticketId}/items/${action.itemId}/complete`;
    case "UNCOMPLETE_ITEM":
      return `/api/tickets/${action.ticketId}/items/${action.itemId}/uncomplete`;
    case "BUMP_TICKET":
      return `/api/tickets/${action.ticketId}/bump`;
    case "RECALL_TICKET":
      return `/api/tickets/${action.ticketId}/recall`;
    case "WINDOW_BUMP_ORDER":
      return `/api/orders/${action.orderId}/expo/bump`;
    case "WINDOW_RECALL_ORDER":
      return `/api/orders/${action.orderId}/expo/recall`;
  }
}

/**
 * Fires the mutation request and lets the resulting WebSocket broadcast (the
 * requester receives its own broadcast too) update local state — this
 * function does not apply anything to local state itself. Correctness over
 * optimism: no local update happens until the server confirms it happened.
 */
export async function sendStationAction(action: StationAction): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${actionEndpoint(action)}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(`${action.type} rejected (${res.status}): ${body.error ?? "unknown error"}`);
  }
}

export function getWebSocketUrl(): string {
  return API_BASE_URL.replace(/^http/, "ws");
}

/**
 * The result of `POST /api/orders`, covering every real outcome the backend
 * can produce — see backend/src/api/router.ts. `requiredKdsWork: false`
 * covers the `200 []` case (every item was origin-suppressed, or otherwise
 * nothing was routable): the order was legitimately accepted, it just didn't
 * need a station ticket. That is success, not an error.
 */
export type PostOrderResult =
  | { ok: true; requiredKdsWork: boolean; tickets: StationTicket[] }
  | { ok: false; reason: "validation" | "network"; message: string };

/**
 * Posts a NormalizedOrder through the same canonical ingestion boundary any
 * POS adapter uses — Mock POS is deliberately just another caller of this,
 * never a shortcut around backend validation/routing/broadcast.
 */
export async function postNormalizedOrder(order: NormalizedOrder): Promise<PostOrderResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      message: error instanceof Error ? error.message : "Network error",
    };
  }

  if (res.status === 400) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    return { ok: false, reason: "validation", message: body.error ?? "Invalid order payload" };
  }

  if (!res.ok) {
    return { ok: false, reason: "network", message: `Unexpected response: ${res.status}` };
  }

  const raw = (await res.json()) as StationTicket[];
  return { ok: true, requiredKdsWork: raw.length > 0, tickets: raw.map(reviveStationTicket) };
}

/**
 * Creates a new, independent REFIRE ticket for one specific item — never
 * mutates the source ticket/item. Follows the same throw-on-rejection
 * convention as `sendStationAction`: the resulting WebSocket broadcast (the
 * requester receives it too) is what actually adds the new ticket to local
 * state, same as every other mutation here — this function does not touch
 * KitchenStateContext itself.
 */
export async function createRefire(ticketId: string, itemId: string): Promise<StationTicket> {
  const res = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/items/${itemId}/refire`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(`REFIRE rejected (${res.status}): ${body.error ?? "unknown error"}`);
  }
  const raw = (await res.json()) as StationTicket;
  return reviveStationTicket(raw);
}
