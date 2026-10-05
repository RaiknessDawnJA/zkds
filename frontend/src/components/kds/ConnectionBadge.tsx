import type { ConnectionStatus } from "@/state/KitchenStateContext";
import styles from "./ConnectionBadge.module.css";

const LABELS: Record<ConnectionStatus, string> = {
  ONLINE: "ONLINE",
  CONNECTING: "CONNECTING",
  RECONNECTING: "RECONNECTING",
  OFFLINE: "OFFLINE — ACTIONS DISABLED",
};

/**
 * A small, always-present indicator of the backend connection — deliberately
 * low visual weight while ONLINE (a muted dot + label), so it never competes
 * with the ticket board, but unmistakable the moment it isn't.
 */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      <span className={styles.dot} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
