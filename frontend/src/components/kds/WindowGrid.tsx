import type { ItemStatus, Station } from "@zkds/shared";
import type { ExpoOrder } from "@/lib/expoOrders";
import { WindowOrderCard } from "./WindowOrderCard";
import styles from "./WindowGrid.module.css";

interface WindowGridProps {
  orders: ExpoOrder[];
  now: number | null;
  onToggleItem: (
    ticketId: string,
    itemId: string,
    currentStatus: ItemStatus,
  ) => void;
  onBump: (orderId: string) => void;
  onRefire: (
    orderNumber: string,
    ticketId: string,
    itemId: string,
    itemName: string,
    station: Station,
  ) => void;
  /** False while the backend connection isn't ONLINE. */
  actionsEnabled: boolean;
}

export function WindowGrid({
  orders,
  now,
  onToggleItem,
  onBump,
  onRefire,
  actionsEnabled,
}: WindowGridProps) {
  if (orders.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>NO OPEN ORDERS</p>
        <p className={styles.emptyHint}>The floor is caught up.</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {orders.map((order) => (
        <WindowOrderCard
          key={order.orderId}
          order={order}
          now={now}
          onToggleItem={onToggleItem}
          onBump={onBump}
          onRefire={onRefire}
          actionsEnabled={actionsEnabled}
        />
      ))}
    </div>
  );
}
