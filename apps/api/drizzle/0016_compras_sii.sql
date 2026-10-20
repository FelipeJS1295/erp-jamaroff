DROP INDEX "purchase_documents_supplier_number_uq";--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "document_type" integer DEFAULT 33 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_exempt" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_net" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_vat" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_total" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_status" varchar(20);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_data" jsonb;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "tax_id" varchar(12);--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tax_id_uq" ON "suppliers" USING btree ("tax_id") WHERE "suppliers"."tax_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_documents_supplier_number_uq" ON "purchase_documents" USING btree ("supplier_id","document_type","document_number");