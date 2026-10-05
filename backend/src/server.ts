import "dotenv/config";
import { createServer } from "node:http";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { apiRouter } from "./api/router";
import { healthRouter } from "./api/health";
import { pool } from "./db/client";
import { logger } from "./logger";
import { attachRealtimeServer } from "./realtime/server";

const app = express();
app.use(express.json());

// The frontend runs on a different origin/port in dev — this is a LAN
// kitchen tool, not an internet-facing product, so a permissive dev CORS
// policy is acceptable rather than a real allowlist.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(healthRouter);
app.use("/api", apiRouter);

// Never leak stack traces to the client — log server-side, return a generic
// message. Express 5 forwards rejected async handlers here automatically.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled API error", { error: String(error) });
  res.status(500).json({ error: "Internal server error" });
});

const server = createServer(app);
attachRealtimeServer(server);

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await pool.query("SELECT 1");
  logger.info("Database connection verified");

  server.listen(port, () => {
    logger.info(`KDS backend listening on port ${port}`, { port });
  });
}

main().catch((error) => {
  logger.error("Failed to start server", { error: String(error) });
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
