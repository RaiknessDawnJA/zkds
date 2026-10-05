"use client";

import type { StationTicket } from "@zkds/shared";
import { TicketTimer } from "./TicketTimer";
import styles from "./RecallList.module.css";

interface RecallTicketProps {
  ticket: StationTicket;
  now: number | null;
  onRecall: (ticketId: string) => void;
  /** False while the backend connection isn't ONLINE. */
  actionsEnabled: boolean;
}

/**
 * A bumped ticket. It keeps its items so the cook can confirm what they are
 * pulling back before pressing RECALL. Urgency deliberately stops escalating
 * here — the station is no longer on the hook for it.
 */
export function RecallTicket({ ticket, now, onRecall, actionsEnabled }: RecallTicketProps) {
  return (
    <article className={styles.card}>
      <div className={styles.info}>
        <div className={styles.topRow}>
          <span className={styles.table}>TABLE {ticket.table}</span>
          <span className={styles.order}>#{ticket.orderNumber}</span>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.server}>{ticket.server}</span>
          {ticket.bumpedAt && (
            <span className={styles.bumpedAgo}>
              BUMPED{" "}
              <TicketTimer
                startedAt={ticket.bumpedAt}
                now={now}
                className={styles.bumpedTimer}
              />{" "}
              AGO
            </span>
          )}
        </div>

        <ul className={styles.itemList}>
          {ticket.items.map((item) => (
            <li key={item.id} className={styles.itemLine}>
              <span className={styles.itemQuantity}>{item.quantity}</span>
              <span className={styles.itemName}>{item.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        className={styles.recall}
        disabled={!actionsEnabled}
        onClick={() => onRecall(ticket.id)}
      >
        RECALL
      </button>
    </article>
  );
}
