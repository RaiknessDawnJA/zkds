"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ACTIVE_RESTAURANT_CONFIG,
  STATION_LABELS,
  type ItemStatus,
  type Station,
} from "@zkds/shared";
import { createRefire } from "@/lib/apiClient";
import {
  buildExpoOrders,
  selectActiveExpoOrders,
  selectRecallExpoOrders,
} from "@/lib/expoOrders";
import { buildOrderSummaries, selectExpoParticipatingTickets } from "@/lib/orderSummary";
import { useNow } from "@/hooks/useNow";
import { useKitchenState } from "@/state/KitchenStateContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConnectionBadge } from "./ConnectionBadge";
import { WindowGrid } from "./WindowGrid";
import { WindowRecallGrid } from "./WindowRecallGrid";
import styles from "./WindowPage.module.css";

interface PendingRefire {
  orderNumber: string;
  ticketId: string;
  itemId: string;
  itemName: string;
  station: Station;
}

type WindowView = "ACTIVE" | "RECALL";

/**
 * The expo workstation: one card per order, aggregating every station's
 * ticket for it. Reads and dispatches into the same shared ticket pool the
 * station screens use — item toggles here are the real COMPLETE_ITEM /
 * UNCOMPLETE_ITEM action, so a change made in Window or on a station shows up
 * on both with no separate Window-side item state. Bump/recall here only ever
 * touch Window's own order-lifecycle state (`expoOrders`), never a
 * StationTicket.
 */
export function WindowPage() {
  const { tickets, expoOrders, dispatch, connectionStatus } = useKitchenState();
  const [view, setView] = useState<WindowView>("ACTIVE");
  const [pendingRefire, setPendingRefire] = useState<PendingRefire | null>(null);
  const now = useNow();
  const actionsEnabled = connectionStatus === "ONLINE";

  const orderSummaries = useMemo(
    () =>
      buildOrderSummaries(
        selectExpoParticipatingTickets(tickets, ACTIVE_RESTAURANT_CONFIG),
      ),
    [tickets],
  );

  const expoOrderList = useMemo(
    () => buildExpoOrders(orderSummaries, expoOrders),
    [orderSummaries, expoOrders],
  );

  const activeOrders = useMemo(
    () => selectActiveExpoOrders(expoOrderList),
    [expoOrderList],
  );

  const recallOrders = useMemo(
    () => selectRecallExpoOrders(expoOrderList),
    [expoOrderList],
  );

  const toggleItem = useCallback(
    (ticketId: string, itemId: string, currentStatus: ItemStatus) => {
      dispatch(
        currentStatus === "READY"
          ? { type: "UNCOMPLETE_ITEM", ticketId, itemId }
          : { type: "COMPLETE_ITEM", ticketId, itemId, at: new Date() },
      );
    },
    [dispatch],
  );

  const bumpOrder = useCallback(
    (orderId: string) => {
      dispatch({ type: "WINDOW_BUMP_ORDER", orderId, at: new Date() });
    },
    [dispatch],
  );

  const recallOrder = useCallback(
    (orderId: string) => {
      dispatch({ type: "WINDOW_RECALL_ORDER", orderId, at: new Date() });
    },
    [dispatch],
  );

  // REFIRE never fires directly on click — it always opens a confirmation
  // first, specifically to avoid accidental double-fires during a rush.
  const requestRefire = useCallback(
    (orderNumber: string, ticketId: string, itemId: string, itemName: string, station: Station) => {
      setPendingRefire({ orderNumber, ticketId, itemId, itemName, station });
    },
    [],
  );

  const cancelRefire = useCallback(() => setPendingRefire(null), []);

  // No local state mutation on success — the resulting STATION_TICKET_UPDATED
  // broadcast (received here too) is what actually adds the new ticket to
  // the board, same as every other mutation in this app.
  const confirmRefire = useCallback(() => {
    if (!pendingRefire) return;
    const { ticketId, itemId } = pendingRefire;
    setPendingRefire(null);
    createRefire(ticketId, itemId).catch((error: unknown) => {
      console.error(error);
    });
  }, [pendingRefire]);

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>STATION</span>
          <h1 className={styles.title}>WINDOW / EXPO</h1>
        </div>

        <nav className={styles.tabs} aria-label="Expo views">
          <button
            type="button"
            className={styles.tab}
            data-selected={view === "ACTIVE"}
            aria-pressed={view === "ACTIVE"}
            onClick={() => setView("ACTIVE")}
          >
            ACTIVE
            <span className={styles.tabCount}>{activeOrders.length}</span>
          </button>
          <button
            type="button"
            className={styles.tab}
            data-selected={view === "RECALL"}
            aria-pressed={view === "RECALL"}
            onClick={() => setView("RECALL")}
          >
            RECALL
            <span className={styles.tabCount}>{recallOrders.length}</span>
          </button>
        </nav>

        <ConnectionBadge status={connectionStatus} />
      </header>

      {view === "ACTIVE" ? (
        <WindowGrid
          orders={activeOrders}
          now={now}
          onToggleItem={toggleItem}
          onBump={bumpOrder}
          onRefire={requestRefire}
          actionsEnabled={actionsEnabled}
        />
      ) : (
        <WindowRecallGrid
          orders={recallOrders}
          now={now}
          onRecall={recallOrder}
          actionsEnabled={actionsEnabled}
        />
      )}

      {pendingRefire && (
        <ConfirmDialog
          title="REFIRE this item?"
          message={`Order #${pendingRefire.orderNumber}: send "${pendingRefire.itemName}" to ${STATION_LABELS[pendingRefire.station]} as a new, urgent REFIRE ticket. The original ticket is not changed.`}
          confirmLabel="REFIRE"
          cancelLabel="CANCEL"
          onConfirm={confirmRefire}
          onCancel={cancelRefire}
        />
      )}
    </main>
  );
}
