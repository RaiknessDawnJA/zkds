"use client";

import { useCallback, useMemo, useState } from "react";
import {
  areAllItemsReady,
  byBoardPriority,
  byMostRecentlyBumpedFirst,
  countPendingItems,
  isBumped,
  isOnActiveBoard,
  type ItemStatus,
  type Station,
  type StationTicket,
} from "@zkds/shared";
import { useNow } from "@/hooks/useNow";
import { calculateAllDay } from "@/lib/allDay";
import { useKitchenState } from "@/state/KitchenStateContext";
import { AllDaySummary } from "./AllDaySummary";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecallList } from "./RecallList";
import { StationHeader, type StationView } from "./StationHeader";
import { TicketGrid } from "./TicketGrid";
import styles from "./StationPage.module.css";

/**
 * Owns all station state for V1: the ticket list plus which tab is showing.
 * Everything below this component is presentational and derives what it needs
 * from the ticket data it is handed.
 */
export function StationPage({ station }: { station: Station }) {
  const { tickets, dispatch, connectionStatus } = useKitchenState();
  const [view, setView] = useState<StationView>("ACTIVE");
  const [ticketAwaitingBumpConfirm, setTicketAwaitingBumpConfirm] =
    useState<StationTicket | null>(null);

  const now = useNow();
  const actionsEnabled = connectionStatus === "ONLINE";

  // Every screen shares the same ticket pool; each station page only shows
  // its own slice of it.
  const stationTickets = useMemo(
    () => tickets.filter((ticket) => ticket.station === station),
    [tickets, station],
  );

  // REFIRE tickets sort above normal tickets regardless of age (byBoardPriority) —
  // the Recall tab below keeps byMostRecentlyBumpedFirst unchanged, since
  // priority only matters for outstanding work.
  const activeTickets = useMemo(
    () => stationTickets.filter(isOnActiveBoard).sort(byBoardPriority),
    [stationTickets],
  );

  const bumpedTickets = useMemo(
    () => stationTickets.filter(isBumped).sort(byMostRecentlyBumpedFirst),
    [stationTickets],
  );

  const allDayEntries = useMemo(
    () => calculateAllDay(activeTickets),
    [activeTickets],
  );

  // Tapping an item flips it; the current status decides which way.
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

  const bumpTicket = useCallback(
    (ticketId: string) => {
      dispatch({ type: "BUMP_TICKET", ticketId, at: new Date() });
    },
    [dispatch],
  );

  const recallTicket = useCallback(
    (ticketId: string) => {
      dispatch({ type: "RECALL_TICKET", ticketId, at: new Date() });
    },
    [dispatch],
  );

  /**
   * Bumping with work outstanding is allowed, but never silently — the cook has
   * to acknowledge it. A fully-ready ticket bumps on the first press.
   */
  const requestBump = useCallback(
    (ticket: StationTicket) => {
      if (areAllItemsReady(ticket)) {
        bumpTicket(ticket.id);
      } else {
        setTicketAwaitingBumpConfirm(ticket);
      }
    },
    [bumpTicket],
  );

  const confirmBump = useCallback(() => {
    if (ticketAwaitingBumpConfirm) {
      bumpTicket(ticketAwaitingBumpConfirm.id);
      setTicketAwaitingBumpConfirm(null);
    }
  }, [bumpTicket, ticketAwaitingBumpConfirm]);

  return (
    <main className={styles.screen}>
      <StationHeader
        station={station}
        view={view}
        onViewChange={setView}
        activeCount={activeTickets.length}
        bumpedCount={bumpedTickets.length}
        now={now}
        connectionStatus={connectionStatus}
      />

      {view === "ACTIVE" ? (
        <>
          <AllDaySummary entries={allDayEntries} />
          <TicketGrid
            tickets={activeTickets}
            now={now}
            onToggleItem={toggleItem}
            onBump={requestBump}
            actionsEnabled={actionsEnabled}
          />
        </>
      ) : (
        <RecallList
          tickets={bumpedTickets}
          now={now}
          onRecall={recallTicket}
          actionsEnabled={actionsEnabled}
        />
      )}

      {ticketAwaitingBumpConfirm && (
        <ConfirmDialog
          title="Some items are not marked ready"
          message={`Order #${ticketAwaitingBumpConfirm.orderNumber} · Table ${
            ticketAwaitingBumpConfirm.table
          } still has ${countPendingItems(
            ticketAwaitingBumpConfirm,
          )} item(s) pending. Bump this ticket anyway?`}
          confirmLabel="BUMP ANYWAY"
          cancelLabel="KEEP WORKING"
          onConfirm={confirmBump}
          onCancel={() => setTicketAwaitingBumpConfirm(null)}
        />
      )}
    </main>
  );
}
