import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NormalizedOrder } from "@zkds/shared";
import { db } from "../db/client";
import { orders } from "../db/schema";

/**
 * Test-only helpers: every test order gets a unique orderNumber (so parallel
 * test runs never collide on the same seed-style order number), and
 * `cleanupOrder` relies on the schema's ON DELETE CASCADE to remove the
 * order's items/tickets/expo state in one delete.
 */
export function testOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    orderNumber: `TEST-${randomUUID().slice(0, 8)}`,
    table: "T1",
    server: "TestServer",
    createdAt: new Date("2026-01-01T18:00:00.000Z"),
    items: [
      { name: "Test Ribeye", quantity: 1, modifiers: [], station: "BROIL" },
      { name: "Test Fries", quantity: 1, modifiers: [], station: "FRY" },
    ],
    ...overrides,
  };
}

export async function cleanupOrder(orderId: string): Promise<void> {
  await db.delete(orders).where(eq(orders.id, orderId));
}
