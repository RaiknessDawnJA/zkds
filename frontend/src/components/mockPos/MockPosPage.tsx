"use client";

import { useCallback, useState } from "react";
import { postNormalizedOrder } from "@/lib/apiClient";
import { MOCK_POS_SCENARIOS, type MockOrderScenario } from "@/lib/mockPosScenarios";
import { ScenarioCard, type ScenarioStatus } from "./ScenarioCard";
import styles from "./MockPosPage.module.css";

const RUSH_SIZES = [5, 10, 25] as const;
const MAX_ACTIVITY_ENTRIES = 20;

type ActivityOutcome = "created" | "accepted-no-work" | "error";

interface ActivityEntry {
  scenarioLabel: string;
  /** Doubles as the React list key — generateMockOrderNumber() already
   *  guarantees uniqueness, so there's no separate counter to keep in sync
   *  with it (and no risk of it drifting out of sync). */
  orderNumber: string;
  outcome: ActivityOutcome;
  detail: string;
  at: Date;
}

/**
 * A scenario launcher, not a simulated register: every button posts a fresh
 * NormalizedOrder through the real `POST /api/orders` boundary
 * (`postNormalizedOrder` in apiClient.ts) — the exact same path a future
 * Mock POS / Square / Toast adapter will use. Nothing here touches
 * KitchenStateContext, PostgreSQL, or a StationTicket directly; the only way
 * anything shows up on a station screen or Window is the real backend
 * validating, routing, persisting, and broadcasting it, same as any other
 * order source.
 */
export function MockPosPage() {
  const [statuses, setStatuses] = useState<Record<string, ScenarioStatus>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [rushInFlight, setRushInFlight] = useState(false);

  const pushActivity = useCallback(
    (entry: Omit<ActivityEntry, "at">) => {
      setActivity((prev) => [{ ...entry, at: new Date() }, ...prev].slice(0, MAX_ACTIVITY_ENTRIES));
    },
    [],
  );

  const fireScenario = useCallback(
    async (scenario: MockOrderScenario) => {
      setStatuses((prev) => ({ ...prev, [scenario.id]: { kind: "pending" } }));

      // A fresh NormalizedOrder every call — buildOrder() is a factory, so
      // nothing is shared or mutated between this click and any other.
      const order = scenario.buildOrder();
      const result = await postNormalizedOrder(order);

      if (!result.ok) {
        setStatuses((prev) => ({
          ...prev,
          [scenario.id]: { kind: "error", message: result.message },
        }));
        pushActivity({
          scenarioLabel: scenario.label,
          orderNumber: order.orderNumber,
          outcome: "error",
          detail: result.message,
        });
        return;
      }

      if (!result.requiredKdsWork) {
        setStatuses((prev) => ({
          ...prev,
          [scenario.id]: { kind: "accepted-no-work", orderNumber: order.orderNumber },
        }));
        pushActivity({
          scenarioLabel: scenario.label,
          orderNumber: order.orderNumber,
          outcome: "accepted-no-work",
          detail: "Accepted — no KDS work required",
        });
        return;
      }

      setStatuses((prev) => ({
        ...prev,
        [scenario.id]: {
          kind: "created",
          orderNumber: order.orderNumber,
          ticketCount: result.tickets.length,
        },
      }));
      pushActivity({
        scenarioLabel: scenario.label,
        orderNumber: order.orderNumber,
        outcome: "created",
        detail: `${result.tickets.length} ticket${result.tickets.length === 1 ? "" : "s"} created`,
      });
    },
    [pushActivity],
  );

  /**
   * Sequential, not parallel: this is a demo/manual-test tool, not a load
   * generator, so legibility beats raw throughput. Firing one at a time —
   * awaiting each POST before starting the next — keeps order numbers and
   * on-screen ticket arrivals in a clear, watchable sequence (useful for
   * literally watching Window/station screens fill up one ticket at a time
   * during a manual test), and avoids opening 25 simultaneous connections
   * against a local dev Postgres pool for no real benefit. Twenty-five
   * sequential localhost round-trips still complete in well under a second,
   * so nothing about it feels slow.
   */
  const fireRush = useCallback(
    async (count: number) => {
      setRushInFlight(true);
      try {
        for (let i = 0; i < count; i++) {
          const scenario = MOCK_POS_SCENARIOS[i % MOCK_POS_SCENARIOS.length];
          await fireScenario(scenario);
        }
      } finally {
        setRushInFlight(false);
      }
    },
    [fireScenario],
  );

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>TESTING TOOL</span>
          <h1 className={styles.title}>MOCK POS</h1>
        </div>
        <p className={styles.subtitle}>
          Not a real POS — fires real orders through <code>POST /api/orders</code>, the same
          ingestion boundary a future POS adapter will use. Every click is a brand-new order.
        </p>
      </header>

      <section className={styles.scenarios} aria-label="Order scenarios">
        {MOCK_POS_SCENARIOS.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            status={statuses[scenario.id] ?? { kind: "idle" }}
            disabled={rushInFlight}
            onFire={() => {
              void fireScenario(scenario);
            }}
          />
        ))}
      </section>

      <section className={styles.rush} aria-label="Rush testing">
        <h2 className={styles.sectionTitle}>RUSH</h2>
        <p className={styles.sectionHint}>
          Fires a deterministic cycle through the scenarios above, one request at a time.
        </p>
        <div className={styles.rushButtons}>
          {RUSH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={styles.rushButton}
              disabled={rushInFlight}
              onClick={() => {
                void fireRush(size);
              }}
            >
              {rushInFlight ? "FIRING…" : `RUSH x${size}`}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.activity} aria-label="Recent activity">
        <h2 className={styles.sectionTitle}>RECENT ACTIVITY</h2>
        {activity.length === 0 ? (
          <p className={styles.activityEmpty}>Nothing fired yet.</p>
        ) : (
          <ul className={styles.activityList}>
            {activity.map((entry) => (
              <li
                key={entry.orderNumber}
                className={styles.activityEntry}
                data-outcome={entry.outcome}
              >
                <span className={styles.activityScenario}>{entry.scenarioLabel}</span>
                <span className={styles.activityOrder}>#{entry.orderNumber}</span>
                <span className={styles.activityDetail}>{entry.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
