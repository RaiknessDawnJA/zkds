"use client";

import { memo, useCallback } from "react";
import {
  countPendingItems,
  isRefireTicket,
  wasRecalled,
  type ItemStatus,
  type StationTicket,
} from "@zkds/shared";
import { getTicketUrgencyAt } from "@/lib/ticketUrgency";
import { KitchenItem } from "./KitchenItem";
import { TicketTimer } from "./TicketTimer";
import { UrgencyBadge } from "./UrgencyBadge";
import styles from "./KitchenTicket.module.css";

interface KitchenTicketProps {
  ticket: StationTicket;
  now: number | null;
  onToggleItem: (
    ticketId: string,
    itemId: string,
    currentStatus: ItemStatus,
  ) => void;
  onBump: (ticket: StationTicket) => void;
  /** False while the backend connection isn't ONLINE — item toggles and BUMP disable. */
  actionsEnabled: boolean;
}

/**
 * Memoized: with dozens of tickets on a board, toggling or bumping one must
 * not re-render the rest. Effective only because `ticket` keeps a stable
 * object reference for every ticket the reducer didn't touch (see
 * stationReducer's updateTicket) and `onToggleItem`/`onBump` are stable
 * callbacks from StationPage — so unaffected tickets see referentially
 * identical props and memo() skips them.
 */
export const KitchenTicket = memo(function KitchenTicket({
  ticket,
  now,
  onToggleItem,
  onBump,
  actionsEnabled,
}: KitchenTicketProps) {
  // Urgency is recomputed from timestamps on every clock tick, so a ticket
  // escalates through the bands on its own with no refresh. REFIRE identity
  // is deliberately independent of this: the timer/urgency band keeps
  // running underneath for display, but data-refire is what actually drives
  // the card's visual priority, and it never changes as the ticket ages.
  const urgency = now === null ? null : getTicketUrgencyAt(ticket, now);
  const pendingCount = countPendingItems(ticket);
  const isRefire = isRefireTicket(ticket);

  // One stable function shared by every item on this ticket — a fresh
  // closure per item per render would defeat KitchenItem's own memo().
  const handleToggleItem = useCallback(
    (itemId: string, currentStatus: ItemStatus) => {
      onToggleItem(ticket.id, itemId, currentStatus);
    },
    [ticket.id, onToggleItem],
  );

  return (
    <article
      className={styles.card}
      data-urgency={urgency ?? "NORMAL"}
      data-recalled={wasRecalled(ticket)}
      data-refire={isRefire}
    >
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.table}>TABLE {ticket.table}</span>
          <TicketTimer
            startedAt={ticket.createdAt}
            now={now}
            className={styles.timer}
          />
        </div>

        <div className={styles.headerMeta}>
          {isRefire && <span className={styles.refireBadge}>REFIRE</span>}
          <span className={styles.order}>#{ticket.orderNumber}</span>
          <span className={styles.server}>{ticket.server}</span>
          <UrgencyBadge urgency={urgency} />
          {wasRecalled(ticket) && (
            <span className={styles.recalled}>RECALLED</span>
          )}
        </div>
      </header>

      <div className={styles.items}>
        {ticket.items.map((item) => (
          <KitchenItem
            key={item.id}
            item={item}
            onToggle={handleToggleItem}
            disabled={!actionsEnabled}
          />
        ))}
      </div>

      <button
        type="button"
        className={styles.bump}
        disabled={!actionsEnabled}
        onClick={() => onBump(ticket)}
      >
        BUMP
        {pendingCount > 0 && (
          <span className={styles.bumpNote}>{pendingCount} PENDING</span>
        )}
      </button>
    </article>
  );
});
