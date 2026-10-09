ALTER TABLE "sales_records" ADD COLUMN "customer_document" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "billing_legal_name" varchar(200);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "billing_tax_id" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "billing_activity" varchar(200);--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "sales_records" ADD COLUMN "fulfillment" varchar(50);