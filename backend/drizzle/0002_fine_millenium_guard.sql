CREATE TABLE "refire_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"order_id" text NOT NULL,
	"origin_ticket_id" text NOT NULL,
	"origin_item_id" text NOT NULL,
	"station" "station" NOT NULL,
	"name" text NOT NULL,
	"modifiers" text[] DEFAULT '{}' NOT NULL,
	"item_status" "item_status" DEFAULT 'PENDING' NOT NULL,
	"item_completed_at" timestamp with time zone,
	"status" "lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"bumped_at" timestamp with time zone,
	"recalled_at" timestamp with time zone,
	CONSTRAINT "refire_tickets_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "refire_tickets" ADD CONSTRAINT "refire_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refire_tickets" ADD CONSTRAINT "refire_tickets_origin_ticket_id_station_tickets_id_fk" FOREIGN KEY ("origin_ticket_id") REFERENCES "public"."station_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refire_tickets" ADD CONSTRAINT "refire_tickets_origin_item_id_order_items_id_fk" FOREIGN KEY ("origin_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;