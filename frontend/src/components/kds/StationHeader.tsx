"use client";

import { STATION_LABELS, type Station } from "@zkds/shared";
import type { ConnectionStatus } from "@/state/KitchenStateContext";
import { ConnectionBadge } from "./ConnectionBadge";
import styles from "./StationHeader.module.css";

export type StationView = "ACTIVE" | "RECALL";

interface StationHeaderProps {
  station: Station;
  view: StationView;
  onViewChange: (view: StationView) => void;
  activeCount: number;
  bumpedCount: number;
  /** Shared clock, or null before mount. */
  now: number | null;
  connectionStatus: ConnectionStatus;
}

export function StationHeader({
  station,
  view,
  onViewChange,
  activeCount,
  bumpedCount,
  now,
  connectionStatus,
}: StationHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.eyebrow}>STATION</span>
        <h1 className={styles.station}>{STATION_LABELS[station]}</h1>
      </div>

      <nav className={styles.tabs} aria-label="Ticket views">
        <ViewTab
          label="ACTIVE"
          count={activeCount}
          selected={view === "ACTIVE"}
          onSelect={() => onViewChange("ACTIVE")}
        />
        <ViewTab
          label="RECALL"
          count={bumpedCount}
          selected={view === "RECALL"}
          onSelect={() => onViewChange("RECALL")}
        />
      </nav>

      <div className={styles.clock}>
        <span className={styles.eyebrow}>TIME</span>
        <span className={styles.clockValue}>
          {now === null ? "--:--" : formatClock(now)}
        </span>
      </div>

      <ConnectionBadge status={connectionStatus} />
    </header>
  );
}

function ViewTab({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tab}
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {label}
      <span className={styles.tabCount}>{count}</span>
    </button>
  );
}

function formatClock(now: number): string {
  return new Date(now).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
