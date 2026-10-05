CREATE TYPE "public"."item_status" AS ENUM('PENDING', 'READY');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('ACTIVE', 'BUMPED', 'RECALLED');--> statement-breakpoint
CREATE TYPE "public"."station" AS ENUM('BROIL', 'FRY', 'SALAD', 'HOT_SIDE', 'WINDOW');--> statement-breakpoint
CREATE TABLE "expo_orders" (
	"order_id" text PRIMARY KEY NOT NULL,
	"status" "lifecycle_status" NOT NULL,
	"bumped_at" timestamp with time zone,
	"recalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"station_ticket_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"modifiers" text[] DEFAULT '{}' NOT NULL,
	"station" "station" NOT NULL,
	"status" "item_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"table_name" text NOT NULL,
	"server_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"station" "station" NOT NULL,
	"status" "lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"bumped_at" timestamp with time zone,
	"recalled_at" timestamp with time zone,
	CONSTRAINT "station_tickets_order_id_station_unique" UNIQUE("order_id","station")
);
--> statement-breakpoint
ALTER TABLE "expo_orders" ADD CONSTRAINT "expo_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_station_ticket_id_station_tickets_id_fk" FOREIGN KEY ("station_ticket_id") REFERENCES "public"."station_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_tickets" ADD CONSTRAINT "station_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;