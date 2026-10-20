ALTER TABLE "customer_receipts" ADD COLUMN "document_type" integer DEFAULT 39 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "status" varchar(20) DEFAULT 'REGISTRADA' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "issued_at" date;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "pdf_data" text;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "pdf_url" text;--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "sii_response" jsonb;