"use client";

import type { ItemStatus, StationTicket } from "@zkds/shared";
import { KitchenTicket } from "./KitchenTicket";
import styles from "./TicketGrid.module.css";

interface TicketGridProps {
  /** Already filtered and sorted oldest-first by the station screen. */
  tickets: StationTicket[];
  now: number | null;
  onToggleItem: (
    ticketId: string,
    itemId: string,
    currentStatus: ItemStatus,
  ) => void;
  onBump: (ticket: StationTicket) => void;
  /** False while the backend connection isn't ONLINE — mutating controls disable. */
  actionsEnabled: boolean;
}

export function TicketGrid({
  tickets,
  now,
  onToggleItem,
  onBump,
  actionsEnabled,
}: TicketGridProps) {
  if (tickets.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>ALL CAUGHT UP</p>
        <p className={styles.emptyHint}>No active tickets at this station.</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {tickets.map((ticket) => (
        <KitchenTicket
          key={ticket.id}
          ticket={ticket}
          now={now}
          onToggleItem={onToggleItem}
          onBump={onBump}
          actionsEnabled={actionsEnabled}
        />
      ))}
    </div>
  );
}
