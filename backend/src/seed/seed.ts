import "dotenv/config";
import { pool } from "../db/client";
import { logger } from "../logger";
import { seedDatabase } from "./seedData";

/**
 * Run explicitly: `npm run seed`. Never automatic, never run on server boot.
 * Inserts the demo dataset on top of whatever's already in the DB — use
 * `npm run reset-demo` to clear existing orders first.
 */

seedDatabase()
  .catch((error) => {
    logger.error("Seed failed", { error: String(error) });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
