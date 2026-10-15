CREATE TABLE "purchase_document_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" date NOT NULL,
	"method" varchar(40),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_document_payments" ADD CONSTRAINT "purchase_document_payments_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_payments" ADD CONSTRAINT "purchase_document_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_document_payments_document_idx" ON "purchase_document_payments" USING btree ("document_id");