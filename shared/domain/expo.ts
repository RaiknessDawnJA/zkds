/**
 * The Window/Expo order lifecycle, independent of any StationTicket. An order
 * can be fully bumped by every station and still be "ACTIVE" from Expo's point
 * of view until Expo itself dispatches it — bumping in Window never touches
 * production station state, and recalling in Window never reopens a station.
 */
export type ExpoOrderStatus = "ACTIVE" | "BUMPED" | "RECALLED";

export interface ExpoOrderState {
  status: ExpoOrderStatus;
  bumpedAt?: Date;
  recalledAt?: Date;
}
