CREATE TABLE "settlement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"line_key" varchar(300) NOT NULL,
	"order_number" varchar(50),
	"sale_item_id" varchar(50),
	"seller_sku" varchar(60),
	"product_name" text,
	"transaction_type" text,
	"transaction_category" varchar(100),
	"kind" varchar(30) DEFAULT 'OTHER' NOT NULL,
	"transaction_date" date,
	"amount_net" numeric(14, 2),
	"tax_amount" numeric(14, 2),
	"amount_gross" numeric(14, 2),
	"commission_pct" numeric(5, 2),
	"payment_status" varchar(50),
	"statement_number" varchar(100),
	"payment_reference" varchar(100),
	"tax_document_number" varchar(50),
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_records_retailer_line_uq" ON "settlement_records" USING btree ("retailer_id","line_key");--> statement-breakpoint
CREATE INDEX "settlement_records_sale_item_idx" ON "settlement_records" USING btree ("retailer_id","sale_item_id");--> statement-breakpoint
CREATE INDEX "settlement_records_order_number_idx" ON "settlement_records" USING btree ("order_number");