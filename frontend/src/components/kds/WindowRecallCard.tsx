"use client";

import { STATION_LABELS } from "@zkds/shared";
import type { ExpoOrder } from "@/lib/expoOrders";
import { TicketTimer } from "./TicketTimer";
import styles from "./WindowRecallCard.module.css";

interface WindowRecallCardProps {
  order: ExpoOrder;
  now: number | null;
  onRecall: (orderId: string) => void;
  /** False while the backend connection isn't ONLINE. */
  actionsEnabled: boolean;
}

/**
 * An order Expo has already dispatched. Read-only — no item toggles here, the
 * same as a station's own RecallTicket — with a RECALL button that puts it
 * back on Expo's active board only. Station tickets are untouched either way.
 */
export function WindowRecallCard({
  order,
  now,
  onRecall,
  actionsEnabled,
}: WindowRecallCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.info}>
        <div className={styles.topRow}>
          <span className={styles.table}>TABLE {order.table}</span>
          <span className={styles.order}>#{order.orderNumber}</span>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.server}>{order.server}</span>
          {order.expoBumpedAt && (
            <span className={styles.bumpedAgo}>
              BUMPED{" "}
              <TicketTimer
                startedAt={order.expoBumpedAt}
                now={now}
                className={styles.bumpedTimer}
              />{" "}
              AGO
            </span>
          )}
        </div>

        <div className={styles.stationList}>
          {order.stations.map((section) => (
            <div key={section.station} className={styles.stationLine}>
              <span className={styles.stationName}>
                {STATION_LABELS[section.station]}
              </span>
              <span className={styles.stationItems}>
                {section.items.map((item) => item.name).join(", ")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className={styles.recall}
        disabled={!actionsEnabled}
        onClick={() => onRecall(order.orderId)}
      >
        RECALL
      </button>
    </article>
  );
}
