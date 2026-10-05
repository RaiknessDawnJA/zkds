import "dotenv/config";
import { db, pool } from "../db/client";
import { orders } from "../db/schema";
import { logger } from "../logger";
import { seedDatabase } from "./seedData";

/**
 * Clears all orders (cascades to items/tickets/expo state) and reseeds the
 * demo dataset with fresh timestamps relative to now. Run explicitly:
 * `npm run reset-demo`. Never automatic, never run on server boot.
 */

async function reset() {
  const deleted = await db.delete(orders).returning({ id: orders.id });
  logger.info("Cleared existing orders", { count: deleted.length });
  await seedDatabase();
}

reset()
  .catch((error) => {
    logger.error("Reset failed", { error: String(error) });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
