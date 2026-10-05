"use client";

import { memo } from "react";
import type { ItemStatus, OrderItem } from "@zkds/shared";
import styles from "./KitchenItem.module.css";

interface KitchenItemProps {
  item: OrderItem;
  /**
   * Takes the item's id/status rather than being pre-bound per item, so
   * KitchenTicket can pass the SAME function reference to every item it
   * renders. A fresh closure per item per render would silently defeat
   * memo() below — every render would look like a prop change.
   */
  onToggle: (itemId: string, currentStatus: ItemStatus) => void;
  /** False while the backend connection isn't ONLINE. */
  disabled?: boolean;
}

/**
 * One line on a ticket. The whole row is the touch target, and tapping it flips
 * PENDING <-> READY. Completed lines stay on the ticket — they are dimmed and
 * struck through, never removed.
 *
 * Memoized: a ticket with several items only has one line change status at a
 * time, and this stops the other lines from re-rendering along with it.
 */
export const KitchenItem = memo(function KitchenItem({
  item,
  onToggle,
  disabled = false,
}: KitchenItemProps) {
  const isReady = item.status === "READY";

  return (
    <button
      type="button"
      className={styles.item}
      data-status={item.status}
      disabled={disabled}
      onClick={() => onToggle(item.id, item.status)}
      aria-pressed={isReady}
      aria-label={`${item.quantity} ${item.name}, ${
        isReady ? "ready" : "pending"
      }`}
    >
      <span className={styles.quantity}>{item.quantity}</span>

      <span className={styles.body}>
        <span className={styles.name}>{item.name}</span>
        {item.modifiers.length > 0 && (
          <span className={styles.modifiers}>
            {item.modifiers.map((modifier) => (
              <span key={modifier} className={styles.modifier}>
                {modifier}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className={styles.state} aria-hidden="true">
        {isReady ? "✓" : ""}
      </span>
    </button>
  );
});
