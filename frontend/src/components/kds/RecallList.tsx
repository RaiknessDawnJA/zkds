"use client";

import type { StationTicket } from "@zkds/shared";
import { RecallTicket } from "./RecallTicket";
import styles from "./RecallList.module.css";

interface RecallListProps {
  /** Bumped tickets, most recently bumped first. */
  tickets: StationTicket[];
  now: number | null;
  onRecall: (ticketId: string) => void;
  /** False while the backend connection isn't ONLINE — RECALL disables. */
  actionsEnabled: boolean;
}

export function RecallList({ tickets, now, onRecall, actionsEnabled }: RecallListProps) {
  if (tickets.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>NOTHING BUMPED YET</p>
        <p className={styles.emptyHint}>
          Bumped tickets stay here so they can be pulled back.
        </p>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-label="Recently bumped tickets">
      <h2 className={styles.heading}>RECENTLY BUMPED</h2>
      <div className={styles.grid}>
        {tickets.map((ticket) => (
          <RecallTicket
            key={ticket.id}
            ticket={ticket}
            now={now}
            onRecall={onRecall}
            actionsEnabled={actionsEnabled}
          />
        ))}
      </div>
    </section>
  );
}
