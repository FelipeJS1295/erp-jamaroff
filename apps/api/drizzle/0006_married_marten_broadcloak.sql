CREATE TABLE "retailer_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"retailer_sku" varchar(80) NOT NULL,
	"seller_sku" varchar(80),
	"name" varchar(300) NOT NULL,
	"list_price" numeric(14, 2),
	"offer_price" numeric(14, 2),
	"offer_from" date,
	"offer_to" date,
	"product_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retailer_products" ADD CONSTRAINT "retailer_products_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_products" ADD CONSTRAINT "retailer_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retailer_products_retailer_sku_uq" ON "retailer_products" USING btree ("retailer_id","retailer_sku");--> statement-breakpoint
CREATE INDEX "retailer_products_seller_sku_idx" ON "retailer_products" USING btree ("seller_sku");--> statement-breakpoint
CREATE INDEX "retailer_products_product_idx" ON "retailer_products" USING btree ("product_id");