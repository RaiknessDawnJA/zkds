import type { AllDayEntry } from "@/lib/allDay";
import { totalAllDayQuantity } from "@/lib/allDay";
import styles from "./AllDaySummary.module.css";

/**
 * Everything the station still owes, rolled up across the active board. Purely
 * presentational — the counts are computed by calculateAllDay().
 */
export function AllDaySummary({ entries }: { entries: AllDayEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className={styles.bar} aria-label="All day totals">
      <div className={styles.heading}>
        <span className={styles.title}>ALL DAY</span>
        <span className={styles.total}>{totalAllDayQuantity(entries)}</span>
      </div>

      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.name} className={styles.entry}>
            <span className={styles.name}>{entry.name}</span>
            <span className={styles.quantity}>{entry.quantity}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
