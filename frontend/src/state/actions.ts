/**
 * What a screen can ask the kitchen state to do. Same shape as the old local
 * reducer's `StationAction` (Steps 1-4) — preserving it unchanged is what
 * lets StationPage/WindowPage dispatch exactly as before without any edits,
 * even though `dispatch` now sends an HTTP request instead of computing a
 * transition locally.
 */
export type StationAction =
  | { type: "COMPLETE_ITEM"; ticketId: string; itemId: string; at: Date }
  | { type: "UNCOMPLETE_ITEM"; ticketId: string; itemId: string }
  | { type: "BUMP_TICKET"; ticketId: string; at: Date }
  | { type: "RECALL_TICKET"; ticketId: string; at: Date }
  | { type: "WINDOW_BUMP_ORDER"; orderId: string; at: Date }
  | { type: "WINDOW_RECALL_ORDER"; orderId: string; at: Date };
