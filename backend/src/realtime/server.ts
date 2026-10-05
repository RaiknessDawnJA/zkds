import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../logger";
import type { KitchenEvent } from "./events";

const clients = new Set<WebSocket>();

/**
 * Attaches a WebSocket server to the same HTTP server/port Express listens
 * on (one PORT, no separate WS port), via the `upgrade` event. Disconnected
 * clients are removed from `clients` on close so the set can never grow
 * unbounded from dead connections.
 */
export function attachRealtimeServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    logger.info("WebSocket client connected", { totalClients: clients.size });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info("WebSocket client disconnected", { totalClients: clients.size });
    });

    ws.on("error", (error) => {
      logger.warn("WebSocket client error", { error: String(error) });
    });
  });
}

/** Fire-and-forget to every currently-open client. The backend never targets
 *  a specific client — clients decide what's relevant to them by filtering
 *  station/order fields locally, same as today's frontend derivation layer. */
export function broadcast(event: KitchenEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

export function connectedClientCount(): number {
  return clients.size;
}
