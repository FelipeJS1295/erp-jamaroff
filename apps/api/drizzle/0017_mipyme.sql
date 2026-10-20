CREATE TABLE "dispatch_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guide_date" date NOT NULL,
	"transfer_type" integer DEFAULT 5 NOT NULL,
	"receptor_rut" varchar(12) NOT NULL,
	"receptor_name" varchar(100) NOT NULL,
	"receptor_activity" varchar(40),
	"address" varchar(70),
	"commune" varchar(20),
	"items" jsonb NOT NULL,
	"total_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reference" varchar(80),
	"status" varchar(20) DEFAULT 'BORRADOR' NOT NULL,
	"draft_code" varchar(40),
	"folio" varchar(30),
	"issued_at" date,
	"mipyme_code" varchar(40),
	"sii_response" jsonb,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "draft_code" varchar(40);--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "mipyme_code" varchar(40);--> statement-breakpoint
ALTER TABLE "customer_receipts" ADD COLUMN "receptor" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "retailer_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "mipyme_code" varchar(40);--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "sii_items" jsonb;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "mipyme_code" varchar(40);--> statement-breakpoint
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_guides_date_idx" ON "dispatch_guides" USING btree ("guide_date");--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;