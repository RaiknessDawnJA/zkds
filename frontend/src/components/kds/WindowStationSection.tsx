"use client";

import { useCallback } from "react";
import { STATION_LABELS, type ItemStatus, type Station } from "@zkds/shared";
import type { StationProgress } from "@/lib/orderSummary";
import { KitchenItem } from "./KitchenItem";
import styles from "./WindowStationSection.module.css";

interface WindowStationSectionProps {
  section: StationProgress;
  onToggleItem: (
    ticketId: string,
    itemId: string,
    currentStatus: ItemStatus,
  ) => void;
  /** Opens the REFIRE confirmation for one specific item — never fires
   *  directly on click, see WindowPage. */
  onRefire: (ticketId: string, itemId: string, itemName: string, station: Station) => void;
  /** False while the backend connection isn't ONLINE. */
  actionsEnabled: boolean;
}

/**
 * One station's slice of an order, inside a Window order card. Items are the
 * real KitchenItem component wired to the real ticket — toggling here
 * dispatches the exact same COMPLETE_ITEM/UNCOMPLETE_ITEM action a station
 * screen would, so Window and the source station stay in sync with zero
 * duplicate state.
 *
 * Deliberately NOT memoized itself — `section` comes from buildOrderSummaries()
 * fresh on every call, so a memo() here would never skip (measured — see
 * WindowOrderCard). The useCallback below still matters: it gives every
 * KitchenItem a stable `onToggle`, which is what lets KitchenItem's own memo
 * actually skip unrelated items even though this component re-renders.
 */
export function WindowStationSection({
  section,
  onToggleItem,
  onRefire,
  actionsEnabled,
}: WindowStationSectionProps) {
  // section.ready reflects the owning StationTicket's BUMPED status. Once a
  // station bumps, the backend's lifecycle validation rejects item toggles
  // against that ticket (404 "not active") — items must go read-only here the
  // moment that happens, not just while offline.
  const itemsDisabled = !actionsEnabled || section.ready;

  const handleToggle = useCallback(
    (itemId: string, currentStatus: ItemStatus) => {
      onToggleItem(section.ticketId, itemId, currentStatus);
    },
    [section.ticketId, onToggleItem],
  );

  return (
    <section className={styles.station} data-ready={section.ready}>
      <div className={styles.header}>
        <span className={styles.name}>{STATION_LABELS[section.station]}</span>
        <span className={styles.status}>
          {section.ready ? "READY" : "WORKING"}
        </span>
      </div>

      <div className={styles.items}>
        {section.items.map((item) => (
          <div key={item.id} className={styles.itemRow}>
            <KitchenItem item={item} onToggle={handleToggle} disabled={itemsDisabled} />
            {/*
              REFIRE stays enabled purely based on connection status, NOT
              section.ready/itemsDisabled — REFIRE creates independent new
              work and is explicitly allowed regardless of the source
              ticket's own lifecycle (ACTIVE/BUMPED/RECALLED), unlike the
              READY/PENDING toggle above which the backend rejects once the
              ticket is bumped.
            */}
            <button
              type="button"
              className={styles.refireButton}
              disabled={!actionsEnabled}
              onClick={() => onRefire(section.ticketId, item.id, item.name, section.station)}
            >
              REFIRE
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
