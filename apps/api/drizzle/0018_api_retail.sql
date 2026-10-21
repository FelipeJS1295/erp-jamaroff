CREATE TABLE "retail_api_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" text,
	"status" varchar(20) DEFAULT 'SIN_PROBAR' NOT NULL,
	"last_error" text,
	"last_test_at" timestamp with time zone,
	"last_orders_sync_at" timestamp with time zone,
	"last_products_sync_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retail_api_connections_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "retail_api_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"external_item_id" varchar(80) NOT NULL,
	"seller_sku" varchar(120),
	"retailer_sku" varchar(120),
	"name" varchar(300),
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2),
	"paid_price" numeric(14, 2),
	"shipping_amount" numeric(14, 2),
	"status" varchar(60),
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "retail_api_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"external_id" varchar(80) NOT NULL,
	"order_number" varchar(80),
	"customer_order_id" varchar(80),
	"order_date" timestamp with time zone,
	"status" varchar(60),
	"customer_name" varchar(200),
	"customer_rut" varchar(20),
	"customer_email" varchar(200),
	"address" varchar(300),
	"commune" varchar(120),
	"region" varchar(120),
	"total" numeric(14, 2),
	"shipping_total" numeric(14, 2),
	"items_count" integer DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_api_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"seller_sku" varchar(120) NOT NULL,
	"retailer_sku" varchar(120),
	"name" varchar(300),
	"brand" varchar(120),
	"price" numeric(14, 2),
	"sale_price" numeric(14, 2),
	"stock" integer,
	"status" varchar(60),
	"url" varchar(500),
	"image_url" varchar(500),
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retail_api_order_items" ADD CONSTRAINT "retail_api_order_items_order_id_retail_api_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."retail_api_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retail_api_order_items_uq" ON "retail_api_order_items" USING btree ("order_id","external_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_api_orders_uq" ON "retail_api_orders" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "retail_api_orders_date_idx" ON "retail_api_orders" USING btree ("order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_api_products_uq" ON "retail_api_products" USING btree ("provider","seller_sku");