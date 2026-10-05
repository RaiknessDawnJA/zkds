import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Schema for the four things Step 5 actually persists: orders, order items,
 * station tickets, and Expo's order lifecycle. Deliberately does NOT store
 * derived values (urgency, waitingOn, All Day totals, readyForBump) — those
 * stay computed from these rows, same as the in-memory version.
 *
 * ids are `text`, not Postgres's native `uuid` type: the shared domain's
 * routing logic (`routeOrderToStationTickets`, reused unchanged from the
 * frontend) assigns deterministic string ids like `${orderId}-${station}`,
 * not UUIDs — forcing a `uuid` column would fight logic that's already
 * tested and doesn't need to change. `orders.id` is still a real UUID value
 * (generated in application code via `randomUUID()`), just stored as text.
 */

// BAR is added here structurally even though DEFAULT_RESTAURANT_CONFIG keeps
// it disabled everywhere — an unused enum value costs nothing, and it means
// a restaurant enabling BAR later is a pure config change, not a migration.
export const stationEnum = pgEnum("station", [
  "BROIL",
  "FRY",
  "SALAD",
  "HOT_SIDE",
  "BAR",
  "WINDOW",
]);

export const itemStatusEnum = pgEnum("item_status", ["PENDING", "READY"]);

// Shared by station_tickets and expo_orders — both are the same three-state
// lifecycle (ACTIVE/BUMPED/RECALLED), just at different granularities.
export const lifecycleStatusEnum = pgEnum("lifecycle_status", [
  "ACTIVE",
  "BUMPED",
  "RECALLED",
]);

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  tableName: text("table_name").notNull(),
  serverName: text("server_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const stationTickets = pgTable(
  "station_tickets",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    station: stationEnum("station").notNull(),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    bumpedAt: timestamp("bumped_at", { withTimezone: true }),
    recalledAt: timestamp("recalled_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.orderId, table.station)],
);

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  stationTicketId: text("station_ticket_id")
    .notNull()
    .references(() => stationTickets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  modifiers: text("modifiers").array().notNull().default([]),
  station: stationEnum("station").notNull(),
  status: itemStatusEnum("status").notNull().default("PENDING"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const expoOrders = pgTable("expo_orders", {
  orderId: text("order_id")
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),
  status: lifecycleStatusEnum("status").notNull(),
  bumpedAt: timestamp("bumped_at", { withTimezone: true }),
  recalledAt: timestamp("recalled_at", { withTimezone: true }),
});

/**
 * Step 7 — REFIRE. Deliberately a separate table from `station_tickets`
 * rather than reusing it: `station_tickets` has UNIQUE(order_id, station),
 * which a repeated/independent refire on the same order+station would
 * violate, and `order_items`/`station_tickets` grouping logic elsewhere
 * (e.g. Window's per-order-per-station aggregation) assumes at most one
 * normal ticket per station per order. A refire ticket always has exactly
 * one item, so there's no separate items table here (no `quantity` column
 * either — it's always 1, synthesized by the mapper, never stored).
 *
 * `item_id` gets its own UNIQUE constraint: every refire item identity must
 * be unique system-wide (item ids are looked up directly by complete/
 * uncomplete), and since it's always a fresh `randomUUID()` generated in
 * application code, the constraint costs nothing and just makes that
 * invariant explicit at the DB level. `origin_item_id` deliberately has NO
 * uniqueness constraint — repeated independent refires of the same original
 * item are valid and expected.
 */
export const refireTickets = pgTable("refire_tickets", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  originTicketId: text("origin_ticket_id")
    .notNull()
    .references(() => stationTickets.id, { onDelete: "cascade" }),
  originItemId: text("origin_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  station: stationEnum("station").notNull(),
  name: text("name").notNull(),
  modifiers: text("modifiers").array().notNull().default([]),
  itemStatus: itemStatusEnum("item_status").notNull().default("PENDING"),
  itemCompletedAt: timestamp("item_completed_at", { withTimezone: true }),
  status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  bumpedAt: timestamp("bumped_at", { withTimezone: true }),
  recalledAt: timestamp("recalled_at", { withTimezone: true }),
});

export const refireTicketsRelations = relations(refireTickets, ({ one }) => ({
  order: one(orders, { fields: [refireTickets.orderId], references: [orders.id] }),
  originTicket: one(stationTickets, {
    fields: [refireTickets.originTicketId],
    references: [stationTickets.id],
  }),
  originItem: one(orderItems, {
    fields: [refireTickets.originItemId],
    references: [orderItems.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  stationTickets: many(stationTickets),
  refireTickets: many(refireTickets),
  expoOrder: one(expoOrders, {
    fields: [orders.id],
    references: [expoOrders.orderId],
  }),
}));

export const stationTicketsRelations = relations(stationTickets, ({ one, many }) => ({
  order: one(orders, {
    fields: [stationTickets.orderId],
    references: [orders.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  stationTicket: one(stationTickets, {
    fields: [orderItems.stationTicketId],
    references: [stationTickets.id],
  }),
}));
