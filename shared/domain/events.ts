import type { ExpoOrderState } from "./expo";
import type { StationTicket } from "./ticket";

/**
 * The realtime wire contract between backend and every client. Shared so
 * backend (producer) and frontend (consumer) can never independently drift on
 * what an event looks like. Every event carries the full updated entity — a
 * client applies one by replacing that entity in its local map by id, no
 * deltas to get subtly wrong.
 */
export type KitchenEvent =
  | { type: "STATION_TICKET_UPDATED"; ticket: StationTicket }
  | { type: "EXPO_ORDER_UPDATED"; orderId: string; expoOrder: ExpoOrderState }
  | { type: "ORDER_CREATED"; tickets: StationTicket[] };
