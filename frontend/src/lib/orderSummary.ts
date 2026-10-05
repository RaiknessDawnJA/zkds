import {
  STATIONS,
  isBumped,
  isRefireTicket,
  type RestaurantStationConfig,
  type Station,
  type StationTicket,
} from "@zkds/shared";

export interface StationProgress {
  station: Station;
  /** The StationTicket this section came from — lets a caller (Window) dispatch
   *  COMPLETE_ITEM/UNCOMPLETE_ITEM against the exact same ticket a station uses. */
  ticketId: string;
  items: StationTicket["items"];
  /** True once this station's ticket is BUMPED. RECALLED counts as not ready. */
  ready: boolean;
}

/** One order's full picture across every station it touches. */
export interface OrderSummary {
  orderId: string;
  orderNumber: string;
  table: string;
  server: string;
  /** Earliest sentAt across the order's tickets — the same clock a station uses. */
  createdAt: Date;
  stations: StationProgress[];
  /** Stations not yet bumped, in canonical station order. */
  waitingOn: Station[];
}

/**
 * Which tickets Window even considers, given this restaurant's config. A
 * station can be enabled (routes real tickets, has its own screen) without
 * participating in Expo — BAR is the motivating case: a service-bar display
 * is real production work, but Window has no business showing drink tickets
 * or waiting on the bartender to bump.
 *
 * REFIRE tickets are excluded unconditionally, regardless of station: a
 * REFIRE is urgent corrective work Expo never waits on or reopens for, and
 * — just as importantly — a REFIRE on the same station as an order's normal
 * ticket would otherwise silently overwrite it in buildOrderSummaries' by-
 * station grouping (which assumes at most one ticket per station per order,
 * true for normal tickets but not guaranteed once REFIRE tickets can share a
 * station). Excluding REFIRE here keeps that assumption valid.
 *
 * Filtering the ticket list HERE, before it ever reaches buildOrderSummaries,
 * is what makes "an order with only non-Expo tickets never appears on
 * Window" true by construction rather than a `.length === 0` check someone
 * has to remember: buildOrderSummaries only ever creates a group for an
 * orderId it actually sees a ticket for.
 */
export function selectExpoParticipatingTickets(
  tickets: StationTicket[],
  config: RestaurantStationConfig,
): StationTicket[] {
  return tickets.filter(
    (ticket) =>
      !isRefireTicket(ticket) &&
      config.expoProductionStations.some((station) => station === ticket.station),
  );
}

/**
 * The Window/Expo view of the world: one card per order, aggregating whatever
 * station tickets exist for it. Readiness is read straight off each ticket's
 * status — nothing here is separate, hard-coded Window state, so a bump or
 * recall made on a station screen is reflected the moment the same ticket
 * objects are re-read.
 *
 * Callers are expected to have already narrowed `tickets` to whichever ones
 * should count for Expo (see `selectExpoParticipatingTickets`) — this
 * function itself stays unaware of restaurant configuration and just groups
 * whatever it's handed, exactly as it always has.
 */
export function buildOrderSummaries(tickets: StationTicket[]): OrderSummary[] {
  const groups = new Map<
    string,
    {
      orderNumber: string;
      table: string;
      server: string;
      earliestCreatedAt: number;
      byStation: Map<Station, StationProgress>;
    }
  >();

  for (const ticket of tickets) {
    let group = groups.get(ticket.orderId);
    if (!group) {
      group = {
        orderNumber: ticket.orderNumber,
        table: ticket.table,
        server: ticket.server,
        earliestCreatedAt: ticket.createdAt.getTime(),
        byStation: new Map(),
      };
      groups.set(ticket.orderId, group);
    } else {
      group.earliestCreatedAt = Math.min(
        group.earliestCreatedAt,
        ticket.createdAt.getTime(),
      );
    }

    group.byStation.set(ticket.station, {
      station: ticket.station,
      ticketId: ticket.id,
      items: ticket.items,
      ready: isBumped(ticket),
    });
  }

  return Array.from(groups, ([orderId, group]) => {
    // Canonical STATIONS order keeps station sections and WAITING ON
    // deterministic regardless of the order tickets happened to arrive in.
    const stations = STATIONS.filter((station) =>
      group.byStation.has(station),
    ).map((station) => group.byStation.get(station)!);

    const summary: OrderSummary = {
      orderId,
      orderNumber: group.orderNumber,
      table: group.table,
      server: group.server,
      createdAt: new Date(group.earliestCreatedAt),
      stations,
      waitingOn: stations
        .filter((entry) => !entry.ready)
        .map((entry) => entry.station),
    };

    return { summary, earliestCreatedAt: group.earliestCreatedAt };
  })
    .sort((a, b) => a.earliestCreatedAt - b.earliestCreatedAt)
    .map((entry) => entry.summary);
}
