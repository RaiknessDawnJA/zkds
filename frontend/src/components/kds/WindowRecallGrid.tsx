"use client";

import type { ExpoOrder } from "@/lib/expoOrders";
import { WindowRecallCard } from "./WindowRecallCard";
import styles from "./WindowRecallGrid.module.css";

interface WindowRecallGridProps {
  /** Bumped orders, most recently bumped first, already capped for display. */
  orders: ExpoOrder[];
  now: number | null;
  onRecall: (orderId: string) => void;
  /** False while the backend connection isn't ONLINE — RECALL disables. */
  actionsEnabled: boolean;
}

export function WindowRecallGrid({
  orders,
  now,
  onRecall,
  actionsEnabled,
}: WindowRecallGridProps) {
  if (orders.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>NOTHING BUMPED YET</p>
        <p className={styles.emptyHint}>
          Orders Expo has dispatched stay here so they can be pulled back.
        </p>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-label="Recently dispatched orders">
      <h2 className={styles.heading}>RECENTLY BUMPED</h2>
      <div className={styles.grid}>
        {orders.map((order) => (
          <WindowRecallCard
            key={order.orderId}
            order={order}
            now={now}
            onRecall={onRecall}
            actionsEnabled={actionsEnabled}
          />
        ))}
      </div>
    </section>
  );
}
