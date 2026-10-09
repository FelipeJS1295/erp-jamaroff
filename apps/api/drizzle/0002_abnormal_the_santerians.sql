ALTER TABLE "sales_records" ADD COLUMN "tax_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "commission_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "discount_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "amounts_include_tax" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;