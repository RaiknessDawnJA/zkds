import type { TicketUrgency } from "@/lib/ticketUrgency";
import styles from "./UrgencyBadge.module.css";

/**
 * The urgency word, always rendered alongside the colour so the board stays
 * readable when colour alone is hard to judge.
 */
export function UrgencyBadge({ urgency }: { urgency: TicketUrgency | null }) {
  return (
    <span className={styles.badge} data-urgency={urgency ?? "NORMAL"}>
      {urgency ?? "—"}
    </span>
  );
}
