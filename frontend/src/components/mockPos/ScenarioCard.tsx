"use client";

import { STATION_LABELS } from "@zkds/shared";
import type { MockOrderScenario } from "@/lib/mockPosScenarios";
import styles from "./ScenarioCard.module.css";

export type ScenarioStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "created"; orderNumber: string; ticketCount: number }
  | { kind: "accepted-no-work"; orderNumber: string }
  | { kind: "error"; message: string };

interface ScenarioCardProps {
  scenario: MockOrderScenario;
  status: ScenarioStatus;
  /** True while a Rush run is in flight — disables individual firing too, so
   *  activity from the two sources never interleaves confusingly. */
  disabled: boolean;
  onFire: () => void;
}

/** One scenario template, one button. Presentational only — all the actual
 *  posting/state lives in MockPosPage; this just renders whatever status
 *  it's handed. */
export function ScenarioCard({ scenario, status, disabled, onFire }: ScenarioCardProps) {
  const pending = status.kind === "pending";

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{scenario.label}</h3>
        <div className={styles.badges}>
          {scenario.stationsInvolved.map((station) => (
            <span key={station} className={styles.badge}>
              {STATION_LABELS[station]}
            </span>
          ))}
        </div>
      </div>

      <p className={styles.description}>{scenario.description}</p>

      <button
        type="button"
        className={styles.fireButton}
        disabled={disabled || pending}
        onClick={onFire}
      >
        {pending ? "FIRING…" : "FIRE ORDER"}
      </button>

      <StatusLine status={status} />
    </article>
  );
}

function StatusLine({ status }: { status: ScenarioStatus }) {
  switch (status.kind) {
    case "idle":
    case "pending":
      return null;
    case "created":
      return (
        <p className={styles.statusSuccess}>
          Created — order #{status.orderNumber} ({status.ticketCount} ticket
          {status.ticketCount === 1 ? "" : "s"})
        </p>
      );
    case "accepted-no-work":
      return (
        <p className={styles.statusSuccess}>
          Accepted — no KDS work required (order #{status.orderNumber})
        </p>
      );
    case "error":
      return <p className={styles.statusError}>Failed: {status.message}</p>;
  }
}
