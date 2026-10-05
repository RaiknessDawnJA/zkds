"use client";

import { STATION_LABELS, type ItemStatus, type Station } from "@zkds/shared";
import type { ExpoOrder } from "@/lib/expoOrders";
import { elapsedMsSince } from "@/lib/timers";
import { getTicketUrgency } from "@/lib/ticketUrgency";
import { TicketTimer } from "./TicketTimer";
import { UrgencyBadge } from "./UrgencyBadge";
import { WindowStationSection } from "./WindowStationSection";
import styles from "./WindowOrderCard.module.css";

interface WindowOrderCardProps {
  order: ExpoOrder;
  now: number | null;
  onToggleItem: (
    ticketId: string,
    itemId: string,
    currentStatus: ItemStatus,
  ) => void;
  onBump: (orderId: string) => void;
  /** Opens the REFIRE confirmation for one specific item, with orderNumber
   *  already attached — see WindowPage. */
  onRefire: (
    orderNumber: string,
    ticketId: string,
    itemId: string,
    itemName: string,
    station: Station,
  ) => void;
  /** False while the backend connection isn't ONLINE — item toggles and BUMP disable. */
  actionsEnabled: boolean;
}

/**
 * Expo's active board card. WAITING ON (or ALL STATIONS READY) sits right
 * under the header — that's the first question Expo needs answered — with the
 * per-station breakdown, using the real interactive item rows, beneath it.
 *
 * Deliberately NOT memoized: buildOrderSummaries()/buildExpoOrders() rebuild
 * every order object fresh on every call, so `order` is never the same
 * reference twice — a memo() here would compare unequal every time and skip
 * nothing, i.e. it would look optimized without doing anything (measured, not
 * assumed — see Step 4 audit). The KitchenItem rows underneath still skip
 * correctly, since their own props DO stay stable across unrelated updates;
 * that's where the real savings are. Revisit if buildOrderSummaries is ever
 * changed to preserve per-order identity.
 */
export function WindowOrderCard({
  order,
  now,
  onToggleItem,
  onBump,
  onRefire,
  actionsEnabled,
}: WindowOrderCardProps) {
  const urgency =
    now === null ? null : getTicketUrgency(elapsedMsSince(order.createdAt, now));
  const wasRecalled = order.expoStatus === "RECALLED";

  return (
    <article
      className={styles.card}
      data-urgency={urgency ?? "NORMAL"}
      data-recalled={wasRecalled}
    >
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.table}>TABLE {order.table}</span>
          <TicketTimer
            startedAt={order.createdAt}
            now={now}
            className={styles.timer}
          />
        </div>

        <div className={styles.headerMeta}>
          <span className={styles.order}>#{order.orderNumber}</span>
          <span className={styles.server}>{order.server}</span>
          <UrgencyBadge urgency={urgency} />
          {wasRecalled && <span className={styles.recalled}>RECALLED</span>}
        </div>
      </header>

      <div className={styles.waitingBanner} data-ready={order.readyForBump}>
        {order.readyForBump
          ? "ALL STATIONS READY"
          : `WAITING ON: ${order.waitingOn
              .map((station) => STATION_LABELS[station])
              .join(", ")}`}
      </div>

      <div className={styles.stations}>
        {order.stations.map((section) => (
          <WindowStationSection
            key={section.station}
            section={section}
            onToggleItem={onToggleItem}
            onRefire={(ticketId, itemId, itemName, station) =>
              onRefire(order.orderNumber, ticketId, itemId, itemName, station)
            }
            actionsEnabled={actionsEnabled}
          />
        ))}
      </div>

      <button
        type="button"
        className={styles.bump}
        disabled={!order.readyForBump || !actionsEnabled}
        onClick={() => onBump(order.orderId)}
      >
        BUMP
      </button>
    </article>
  );
}
