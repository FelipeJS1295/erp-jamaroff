CREATE TYPE "public"."channel_type" AS ENUM('department_store', 'supermarket', 'marketplace', 'ecommerce', 'other');--> statement-breakpoint
CREATE TABLE "retailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"legal_name" varchar(200),
	"tax_id" varchar(20),
	"channel_type" "channel_type" DEFAULT 'department_store' NOT NULL,
	"commission_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"payment_days" integer DEFAULT 30 NOT NULL,
	"commercial_terms" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retailers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sales_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"external_item_id" varchar(50) NOT NULL,
	"seller_sku" varchar(60),
	"product_name" text,
	"order_date" date,
	"order_number" varchar(50),
	"order_id" varchar(50),
	"document_type" varchar(20),
	"status" varchar(50),
	"customer_name" varchar(200),
	"customer_email" varchar(200),
	"shipping_name" varchar(200),
	"shipping_address" text,
	"shipping_commune" varchar(100),
	"shipping_region" varchar(100),
	"paid_price" numeric(14, 2),
	"unit_price" numeric(14, 2),
	"shipping_cost" numeric(14, 2),
	"carrier" varchar(100),
	"tracking_code" varchar(100),
	"dispatch_deadline" date,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_records_retailer_item_uq" ON "sales_records" USING btree ("retailer_id","external_item_id");--> statement-breakpoint
CREATE INDEX "sales_records_order_date_idx" ON "sales_records" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "sales_records_order_number_idx" ON "sales_records" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "sales_records_seller_sku_idx" ON "sales_records" USING btree ("seller_sku");