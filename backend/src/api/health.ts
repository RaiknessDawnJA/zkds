import { Router } from "express";
import { pool } from "../db/client";
import { connectedClientCount } from "../realtime/server";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", websocketClients: connectedClientCount() });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});
