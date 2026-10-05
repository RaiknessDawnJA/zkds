import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../logger";
import { db, pool } from "./client";

async function main() {
  logger.info("Running database migrations");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Migrations complete");
  await pool.end();
}

main().catch((error) => {
  logger.error("Migration failed", { error: String(error) });
  process.exit(1);
});
