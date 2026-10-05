import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  applyBumpExpoOrder,
  applyBumpTicket,
  applyCompleteItem,
  applyRecallExpoOrder,
  applyRecallTicket,
  applyUncompleteItem,
  type ExpoOrderState,
  type RestaurantStationConfig,
  type StationTicket,
} from "@zkds/shared";
import { db } from "../db/client";
import { expoOrders, orderItems, refireTickets, stationTickets } from "../db/schema";
import { rowToExpoOrderState, rowToRefireStationTicket, rowToStationTicket } from "./mappers";

/**
 * DB-backed wrappers around the shared pure transitions: load -> apply ->
 * persist-only-what-changed, all inside one transaction. Each returns `null`
 * when the transition was rejected or a genuine no-op (reference-equal to
 * the input), so a caller (the HTTP layer) can tell "nothing to broadcast"
 * from "something changed" without re-deriving that itself.
 *
 * Step 7: these same load/apply/persist wrappers now transparently handle
 * REFIRE tickets too — a ticket id is looked up in `station_tickets` first,
 * then `refire_tickets`, and persisted back to whichever table it actually
 * came from. The pure transition functions (`applyCompleteItem` etc.) never
 * change: a REFIRE ticket is just a StationTicket to them, same as it is to
 * every frontend component.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LoadedTicket = { ticket: StationTicket; source: "station" | "refire" };

async function loadAnyTicket(tx: Tx, ticketId: string): Promise<LoadedTicket | null> {
  const stationRow = await tx.query.stationTickets.findFirst({
    where: eq(stationTickets.id, ticketId),
    with: { items: true, order: true },
  });
  if (stationRow) return { ticket: rowToStationTicket(stationRow), source: "station" };

  const refireRow = await tx.query.refireTickets.findFirst({
    where: eq(refireTickets.id, ticketId),
    with: { order: true },
  });
  if (refireRow) return { ticket: rowToRefireStationTicket(refireRow), source: "refire" };

  return null;
}

async function persistStationTicket(
  tx: Tx,
  ticketId: string,
  before: StationTicket,
  after: StationTicket,
): Promise<void> {
  await tx
    .update(stationTickets)
    .set({
      status: after.status,
      bumpedAt: after.bumpedAt ?? null,
      recalledAt: after.recalledAt ?? null,
    })
    .where(eq(stationTickets.id, ticketId));

  for (let i = 0; i < after.items.length; i++) {
    const item = after.items[i];
    if (item === before.items[i]) continue; // unchanged — nothing to write
    await tx
      .update(orderItems)
      .set({ status: item.status, completedAt: item.completedAt ?? null })
      .where(eq(orderItems.id, item.id));
  }
}

/** A refire ticket's one item lives on the same row as the ticket itself, so
 *  there's no per-item loop — one UPDATE covers both. */
async function persistRefireTicket(tx: Tx, ticketId: string, after: StationTicket): Promise<void> {
  const item = after.items[0];
  await tx
    .update(refireTickets)
    .set({
      status: after.status,
      bumpedAt: after.bumpedAt ?? null,
      recalledAt: after.recalledAt ?? null,
      itemStatus: item.status,
      itemCompletedAt: item.completedAt ?? null,
    })
    .where(eq(refireTickets.id, ticketId));
}

async function applyTicketTransition(
  ticketId: string,
  transform: (ticket: StationTicket) => StationTicket,
): Promise<StationTicket | null> {
  return db.transaction(async (tx) => {
    const found = await loadAnyTicket(tx, ticketId);
    if (!found) return null;
    const { ticket: before, source } = found;

    const after = transform(before);
    if (after === before) return null; // rejected or genuine no-op

    if (source === "station") {
      await persistStationTicket(tx, ticketId, before, after);
    } else {
      await persistRefireTicket(tx, ticketId, after);
    }

    return after;
  });
}

export function completeItem(ticketId: string, itemId: string, at: Date) {
  return applyTicketTransition(ticketId, (ticket) => applyCompleteItem(ticket, itemId, at));
}

export function uncompleteItem(ticketId: string, itemId: string) {
  return applyTicketTransition(ticketId, (ticket) => applyUncompleteItem(ticket, itemId));
}

export function bumpTicket(ticketId: string, at: Date) {
  return applyTicketTransition(ticketId, (ticket) => applyBumpTicket(ticket, at));
}

export function recallTicket(ticketId: string, at: Date) {
  return applyTicketTransition(ticketId, (ticket) => applyRecallTicket(ticket, at));
}

export type BumpExpoOrderResult =
  | { ok: true; expoOrder: ExpoOrderState }
  | { ok: false; reason: "NOT_READY" | "ORDER_NOT_FOUND" };

/**
 * The one mutation with a real check-then-write shape: eligibility depends on
 * every Expo-participating station ticket for the order, not just one row.
 * `FOR UPDATE` locks those ticket rows for the transaction so a concurrent
 * RECALL_TICKET can't land between the check and the write.
 *
 * `config` decides which of the order's tickets even count toward
 * eligibility — a station can be enabled (routes real tickets, has its own
 * screen) without participating in Expo (BAR: real production work, but
 * Window has no business waiting on the bartender to bump). The filtering
 * happens HERE, before `applyBumpExpoOrder` ever runs, so that function (and
 * `areAllStationTicketsBumpedForOrder` beneath it) stay fully unaware of
 * restaurant configuration — an order whose only tickets are non-Expo
 * stations correctly filters down to zero tickets and hits the existing
 * "no tickets = not ready" guard, never a vacuous "every ticket bumped".
 *
 * REFIRE tickets need no exclusion clause here at all: `allTickets` below is
 * loaded exclusively from `station_tickets` by `orderId`, and a REFIRE
 * ticket lives only in the separate `refire_tickets` table — it structurally
 * cannot appear in this query's results. An active REFIRE can therefore
 * never block or affect Expo eligibility, by construction, not by a filter
 * that has to remember to exclude it.
 */
export async function bumpExpoOrder(
  orderId: string,
  at: Date,
  config: RestaurantStationConfig,
): Promise<BumpExpoOrderResult> {
  return db.transaction(async (tx) => {
    const lockedIds = await tx
      .select({ id: stationTickets.id })
      .from(stationTickets)
      .where(eq(stationTickets.orderId, orderId))
      .for("update");

    if (lockedIds.length === 0) return { ok: false, reason: "ORDER_NOT_FOUND" };

    const ticketRows = await tx.query.stationTickets.findMany({
      where: eq(stationTickets.orderId, orderId),
      with: { items: true, order: true },
    });
    const allTickets = ticketRows.map(rowToStationTicket);
    const expoTickets = allTickets.filter((ticket) =>
      config.expoProductionStations.some((station) => station === ticket.station),
    );

    const expoRow = await tx.query.expoOrders.findFirst({
      where: eq(expoOrders.orderId, orderId),
    });
    const current = expoRow ? rowToExpoOrderState(expoRow) : undefined;

    const next = applyBumpExpoOrder(expoTickets, orderId, current, at);
    if (next === null) return { ok: false, reason: "NOT_READY" };

    await tx
      .insert(expoOrders)
      .values({
        orderId,
        status: next.status,
        bumpedAt: next.bumpedAt,
        recalledAt: next.recalledAt ?? null,
      })
      .onConflictDoUpdate({
        target: expoOrders.orderId,
        set: { status: next.status, bumpedAt: next.bumpedAt, recalledAt: next.recalledAt ?? null },
      });

    return { ok: true, expoOrder: next };
  });
}

/**
 * Simple read-check-write, no explicit row lock: a "double recall" race is
 * low-stakes (worst case, a second RECALL_TICKET-equivalent request is a
 * no-op) and doesn't warrant the extra locking the bump path needs.
 */
export async function recallExpoOrder(
  orderId: string,
  at: Date,
): Promise<{ ok: true; expoOrder: ExpoOrderState } | { ok: false }> {
  return db.transaction(async (tx) => {
    const expoRow = await tx.query.expoOrders.findFirst({
      where: eq(expoOrders.orderId, orderId),
    });
    const current = expoRow ? rowToExpoOrderState(expoRow) : undefined;

    const next = applyRecallExpoOrder(current, at);
    if (next === null) return { ok: false };

    await tx
      .update(expoOrders)
      .set({ status: next.status, recalledAt: next.recalledAt ?? null })
      .where(eq(expoOrders.orderId, orderId));

    return { ok: true, expoOrder: next };
  });
}

export type CreateRefireResult =
  | { ok: true; ticket: StationTicket }
  | { ok: false; reason: "TICKET_NOT_FOUND" | "ITEM_NOT_FOUND" };

/**
 * Creates one new, independent unit of kitchen work from a single existing
 * item — never reopens or mutates the source. The source must be a real
 * `station_tickets` row (refiring a REFIRE isn't a supported source in this
 * pass — provenance is meant to point at "the exact source station ticket",
 * singular). Allowed regardless of the source ticket's own status
 * (ACTIVE/BUMPED/RECALLED): Expo may legitimately catch a problem after the
 * station has already bumped, or even after the ticket was recalled once.
 *
 * A single INSERT, no read-modify-write — nothing about the source ticket or
 * its items is ever touched, by construction, not by a guard that has to
 * remember not to.
 */
export async function createRefire(
  ticketId: string,
  itemId: string,
  at: Date,
): Promise<CreateRefireResult> {
  return db.transaction(async (tx) => {
    const ticketRow = await tx.query.stationTickets.findFirst({
      where: eq(stationTickets.id, ticketId),
      with: { items: true, order: true },
    });
    if (!ticketRow) return { ok: false, reason: "TICKET_NOT_FOUND" };

    const originItem = ticketRow.items.find((item) => item.id === itemId);
    if (!originItem) return { ok: false, reason: "ITEM_NOT_FOUND" };

    // Fresh, distinct identities: the refire ticket's own id, and a
    // separate id for its one synthesized item — never originItemId, never
    // each other. Provenance (below) is the only link back to the source.
    const refireTicketId = randomUUID();
    const refireItemId = randomUUID();

    await tx.insert(refireTickets).values({
      id: refireTicketId,
      itemId: refireItemId,
      orderId: ticketRow.orderId,
      originTicketId: ticketRow.id,
      originItemId: originItem.id,
      station: originItem.station,
      name: originItem.name,
      modifiers: originItem.modifiers,
      itemStatus: "PENDING",
      itemCompletedAt: null,
      status: "ACTIVE",
      createdAt: at,
      bumpedAt: null,
      recalledAt: null,
    });

    const ticket: StationTicket = {
      id: refireTicketId,
      orderId: ticketRow.orderId,
      orderNumber: ticketRow.order.orderNumber,
      table: ticketRow.order.tableName,
      server: ticketRow.order.serverName,
      station: originItem.station,
      items: [
        {
          id: refireItemId,
          name: originItem.name,
          quantity: 1,
          modifiers: originItem.modifiers,
          station: originItem.station,
          status: "PENDING",
          sentAt: at,
        },
      ],
      status: "ACTIVE",
      createdAt: at,
      refire: { originTicketId: ticketRow.id, originItemId: originItem.id },
    };

    return { ok: true, ticket };
  });
}
