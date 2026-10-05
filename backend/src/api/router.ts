import { Router } from "express";
import {
  ACTIVE_RESTAURANT_CONFIG,
  isEnabledProductionStation,
  type NormalizedOrder,
  type NormalizedOrderItem,
  type RestaurantStationConfig,
} from "@zkds/shared";
import { createOrder } from "../domain/ingestion";
import {
  bumpExpoOrder,
  bumpTicket,
  completeItem,
  createRefire,
  recallExpoOrder,
  recallTicket,
  uncompleteItem,
} from "../domain/mutations";
import { loadSnapshot } from "../domain/snapshot";
import { logger } from "../logger";
import { broadcast } from "../realtime/server";

export const apiRouter = Router();

apiRouter.get("/kitchen/snapshot", async (_req, res) => {
  res.json(await loadSnapshot());
});

apiRouter.post("/tickets/:ticketId/items/:itemId/complete", async (req, res) => {
  const { ticketId, itemId } = req.params;
  const ticket = await completeItem(ticketId, itemId, new Date());
  if (!ticket) {
    logger.warn("complete item rejected", { ticketId, itemId });
    res.status(404).json({ error: "Ticket or item not found, not active, or already ready" });
    return;
  }
  broadcast({ type: "STATION_TICKET_UPDATED", ticket });
  res.json(ticket);
});

apiRouter.post("/tickets/:ticketId/items/:itemId/uncomplete", async (req, res) => {
  const { ticketId, itemId } = req.params;
  const ticket = await uncompleteItem(ticketId, itemId);
  if (!ticket) {
    logger.warn("uncomplete item rejected", { ticketId, itemId });
    res.status(404).json({ error: "Ticket or item not found, not active, or already pending" });
    return;
  }
  broadcast({ type: "STATION_TICKET_UPDATED", ticket });
  res.json(ticket);
});

apiRouter.post("/tickets/:ticketId/bump", async (req, res) => {
  const ticket = await bumpTicket(req.params.ticketId, new Date());
  if (!ticket) {
    logger.warn("bump ticket rejected", { ticketId: req.params.ticketId });
    res.status(404).json({ error: "Ticket not found or not eligible to bump" });
    return;
  }
  broadcast({ type: "STATION_TICKET_UPDATED", ticket });
  res.json(ticket);
});

apiRouter.post("/tickets/:ticketId/recall", async (req, res) => {
  const ticket = await recallTicket(req.params.ticketId, new Date());
  if (!ticket) {
    logger.warn("recall ticket rejected", { ticketId: req.params.ticketId });
    res.status(404).json({ error: "Ticket not found or not eligible to recall" });
    return;
  }
  broadcast({ type: "STATION_TICKET_UPDATED", ticket });
  res.json(ticket);
});

apiRouter.post("/tickets/:ticketId/items/:itemId/refire", async (req, res) => {
  const { ticketId, itemId } = req.params;
  const result = await createRefire(ticketId, itemId, new Date());
  if (!result.ok) {
    logger.warn("refire rejected", { ticketId, itemId, reason: result.reason });
    res.status(404).json({ error: result.reason });
    return;
  }
  broadcast({ type: "STATION_TICKET_UPDATED", ticket: result.ticket });
  res.status(201).json(result.ticket);
});

apiRouter.post("/orders/:orderId/expo/bump", async (req, res) => {
  const { orderId } = req.params;
  const result = await bumpExpoOrder(orderId, new Date(), ACTIVE_RESTAURANT_CONFIG);
  if (!result.ok) {
    logger.warn("expo bump rejected", { orderId, reason: result.reason });
    const status = result.reason === "ORDER_NOT_FOUND" ? 404 : 409;
    res.status(status).json({ error: result.reason });
    return;
  }
  broadcast({ type: "EXPO_ORDER_UPDATED", orderId, expoOrder: result.expoOrder });
  res.json(result.expoOrder);
});

apiRouter.post("/orders/:orderId/expo/recall", async (req, res) => {
  const { orderId } = req.params;
  const result = await recallExpoOrder(orderId, new Date());
  if (!result.ok) {
    logger.warn("expo recall rejected", { orderId });
    res.status(409).json({ error: "Order was not Window-bumped" });
    return;
  }
  broadcast({ type: "EXPO_ORDER_UPDATED", orderId, expoOrder: result.expoOrder });
  res.json(result.expoOrder);
});

apiRouter.post("/orders", async (req, res) => {
  const normalized = parseNormalizedOrder(req.body, ACTIVE_RESTAURANT_CONFIG);
  if (!normalized) {
    logger.warn("order ingestion rejected: invalid payload");
    res.status(400).json({ error: "Invalid order payload" });
    return;
  }

  const tickets = await createOrder(normalized);
  if (tickets.length === 0) {
    // Every item was suppressed by originStation (or none were routable) —
    // a legitimate outcome, not an error. Nothing was persisted, so there's
    // nothing to broadcast and no resource was "created".
    logger.info("order accepted with nothing to route", {
      orderNumber: normalized.orderNumber,
    });
    res.status(200).json(tickets);
    return;
  }

  broadcast({ type: "ORDER_CREATED", tickets });
  res.status(201).json(tickets);
});

// A NormalizedOrderItem's quantity is a POS-side aggregation convenience —
// ingestion (createOrder) expands it into that many independent internal
// items. An unbounded quantity would let one malformed/malicious line force
// ingestion to materialize an excessive number of rows in one request.
const MAX_NORMALIZED_ITEM_QUANTITY = 50;

// Manual, minimal validation — this is a small payload, not worth a schema
// validation dependency. Rejects anything malformed rather than trusting it.
// Exported for direct unit testing of the validation rules, independent of
// the HTTP layer. Takes `config` explicitly rather than reaching for
// DEFAULT_RESTAURANT_CONFIG itself, so a future per-request/tenant config
// source only requires changing what the /orders handler passes in above.
export function parseNormalizedOrder(
  body: unknown,
  config: RestaurantStationConfig,
): NormalizedOrder | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.orderNumber !== "string" || b.orderNumber.length === 0) return null;
  if (typeof b.table !== "string" || b.table.length === 0) return null;
  if (typeof b.server !== "string" || b.server.length === 0) return null;
  if (!Array.isArray(b.items) || b.items.length === 0) return null;

  const items: NormalizedOrderItem[] = [];
  for (const raw of b.items) {
    if (typeof raw !== "object" || raw === null) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== "string" || item.name.length === 0) return null;
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_NORMALIZED_ITEM_QUANTITY
    ) {
      return null;
    }
    if (!isValidOrderStation(item.station, config)) return null;
    const modifiers = Array.isArray(item.modifiers)
      ? item.modifiers.filter((m): m is string => typeof m === "string")
      : [];
    items.push({
      name: item.name,
      quantity: item.quantity,
      modifiers,
      station: item.station as NormalizedOrderItem["station"],
    });
  }

  let createdAt: Date | undefined;
  if (typeof b.createdAt === "string") {
    const parsed = new Date(b.createdAt);
    if (Number.isNaN(parsed.getTime())) return null;
    createdAt = parsed;
  }

  let originStation: NormalizedOrder["originStation"];
  if (b.originStation !== undefined) {
    if (!isValidOrderStation(b.originStation, config)) return null;
    originStation = b.originStation as NormalizedOrder["originStation"];
  }

  return {
    orderNumber: b.orderNumber,
    table: b.table,
    server: b.server,
    items,
    createdAt,
    originStation,
  };
}

/**
 * Thin `unknown` -> `string` coercion around the shared enablement rule
 * (`isEnabledProductionStation`) — the actual structural + enabled check
 * lives in `@zkds/shared` so this file and the seed script can't drift on
 * what "valid" means.
 */
function isValidOrderStation(value: unknown, config: RestaurantStationConfig): boolean {
  return isEnabledProductionStation(String(value), config);
}
