"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { ExpoOrderState, KitchenEvent, StationTicket } from "@zkds/shared";
import {
  fetchSnapshot,
  getWebSocketUrl,
  reviveKitchenEvent,
  sendStationAction,
  type KitchenSnapshot,
} from "@/lib/apiClient";
import type { StationAction } from "./actions";

/**
 * As of Step 5 Phase B, the backend is the sole authority for kitchen state.
 * This provider does not compute transitions — it mirrors whatever the server
 * says happened. `dispatch` sends a request; the resulting WebSocket
 * broadcast (which the requester receives too, same as every other client)
 * is what actually updates local state. No optimistic updates: if a mutation
 * is rejected, nothing here changes and the error is logged.
 */
export type ConnectionStatus = "CONNECTING" | "ONLINE" | "RECONNECTING" | "OFFLINE";

interface SyncState {
  tickets: StationTicket[];
  expoOrders: Record<string, ExpoOrderState>;
}

type SyncAction =
  | { type: "SNAPSHOT_LOADED"; snapshot: KitchenSnapshot }
  | { type: "EVENT_RECEIVED"; event: KitchenEvent };

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "SNAPSHOT_LOADED":
      return { tickets: action.snapshot.tickets, expoOrders: action.snapshot.expoOrders };
    case "EVENT_RECEIVED":
      return applyEvent(state, action.event);
  }
}

/** A client applies a broadcast by replacing the entity in its local map by
 *  id — no deltas, so a stale or out-of-order event can't corrupt state. */
function applyEvent(state: SyncState, event: KitchenEvent): SyncState {
  switch (event.type) {
    case "STATION_TICKET_UPDATED": {
      const exists = state.tickets.some((ticket) => ticket.id === event.ticket.id);
      const tickets = exists
        ? state.tickets.map((ticket) => (ticket.id === event.ticket.id ? event.ticket : ticket))
        : [...state.tickets, event.ticket];
      return { ...state, tickets };
    }
    case "EXPO_ORDER_UPDATED":
      return {
        ...state,
        expoOrders: { ...state.expoOrders, [event.orderId]: event.expoOrder },
      };
    case "ORDER_CREATED": {
      const existingIds = new Set(state.tickets.map((ticket) => ticket.id));
      const newTickets = event.tickets.filter((ticket) => !existingIds.has(ticket.id));
      return { ...state, tickets: [...state.tickets, ...newTickets] };
    }
  }
}

interface KitchenStateValue {
  tickets: StationTicket[];
  expoOrders: Record<string, ExpoOrderState>;
  dispatch: (action: StationAction) => void;
  connectionStatus: ConnectionStatus;
}

const KitchenStateContext = createContext<KitchenStateValue | null>(null);

const RECONNECT_DELAY_MS = 2000;

export function KitchenStateProvider({ children }: { children: ReactNode }) {
  const [state, syncDispatch] = useReducer(syncReducer, { tickets: [], expoOrders: {} });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTING");

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let hasConnectedBefore = false;

    function connect() {
      setConnectionStatus(hasConnectedBefore ? "RECONNECTING" : "CONNECTING");

      // Events that arrive while the snapshot fetch is still in flight are
      // buffered, then replayed on top of the snapshot once it lands —
      // otherwise an event could arrive, get applied to empty state, and
      // then be silently overwritten when the (now-stale-looking) snapshot
      // finally resolves.
      let snapshotApplied = false;
      let bufferedEvents: KitchenEvent[] = [];

      ws = new WebSocket(getWebSocketUrl());

      ws.addEventListener("open", () => {
        hasConnectedBefore = true;
        fetchSnapshot()
          .then((snapshot) => {
            if (cancelled) return;
            syncDispatch({ type: "SNAPSHOT_LOADED", snapshot });
            snapshotApplied = true;
            for (const event of bufferedEvents) {
              syncDispatch({ type: "EVENT_RECEIVED", event });
            }
            bufferedEvents = [];
            setConnectionStatus("ONLINE");
          })
          .catch((error: unknown) => {
            console.error("Failed to load kitchen snapshot", error);
            if (!cancelled) setConnectionStatus("OFFLINE");
          });
      });

      ws.addEventListener("message", (message) => {
        const event = reviveKitchenEvent(JSON.parse(message.data as string) as KitchenEvent);
        if (snapshotApplied) {
          syncDispatch({ type: "EVENT_RECEIVED", event });
        } else {
          bufferedEvents.push(event);
        }
      });

      ws.addEventListener("close", () => {
        if (cancelled) return;
        setConnectionStatus("OFFLINE");
        // Simple fixed-interval retry — full re-snapshot on every reconnect,
        // never assuming events weren't missed while disconnected.
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      });

      ws.addEventListener("error", () => {
        ws?.close();
      });
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const dispatch = useCallback((action: StationAction) => {
    sendStationAction(action).catch((error: unknown) => {
      console.error(error);
    });
  }, []);

  return (
    <KitchenStateContext.Provider
      value={{ tickets: state.tickets, expoOrders: state.expoOrders, dispatch, connectionStatus }}
    >
      {children}
    </KitchenStateContext.Provider>
  );
}

export function useKitchenState(): KitchenStateValue {
  const value = useContext(KitchenStateContext);
  if (!value) {
    throw new Error("useKitchenState must be used within a KitchenStateProvider");
  }
  return value;
}
