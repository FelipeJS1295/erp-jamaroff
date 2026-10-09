CREATE TABLE "product_channel_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"retailer_id" uuid NOT NULL,
	"commission_pct" numeric(5, 2),
	"logistics_cost" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "profit_pct" numeric(5, 2) DEFAULT '20' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "returns_pct" numeric(5, 2) DEFAULT '5' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_channel_costs" ADD CONSTRAINT "product_channel_costs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_channel_costs" ADD CONSTRAINT "product_channel_costs_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_channel_costs_uq" ON "product_channel_costs" USING btree ("product_id","retailer_id");