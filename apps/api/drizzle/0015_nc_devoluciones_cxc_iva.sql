CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"receipt_id" uuid,
	"receipt_number" varchar(50) NOT NULL,
	"receipt_type" integer DEFAULT 39 NOT NULL,
	"receipt_date" date,
	"ref_code" integer DEFAULT 1 NOT NULL,
	"reason" varchar(90) NOT NULL,
	"amount_gross" numeric(14, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'BORRADOR' NOT NULL,
	"draft_code" varchar(40),
	"folio" varchar(30),
	"issued_at" date,
	"sii_response" jsonb,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"requested_at" date NOT NULL,
	"scope" varchar(10) DEFAULT 'TOTAL' NOT NULL,
	"reason" varchar(200) NOT NULL,
	"status" varchar(20) DEFAULT 'SOLICITADA' NOT NULL,
	"received_at" date,
	"product_condition" varchar(20),
	"refund_gross" numeric(14, 2),
	"reverse_logistics_cost" numeric(14, 2),
	"supplier_action" varchar(20) DEFAULT 'NINGUNA' NOT NULL,
	"supplier_credit_gross" numeric(14, 2),
	"tracking_code" varchar(80),
	"notes" text,
	"credit_note_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "payment_base" varchar(20) DEFAULT 'ORDEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "issue_date" date;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_receipt_id_customer_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."customer_receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_returns" ADD CONSTRAINT "product_returns_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_returns" ADD CONSTRAINT "product_returns_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_returns" ADD CONSTRAINT "product_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("retailer_id","order_number");--> statement-breakpoint
CREATE INDEX "product_returns_order_idx" ON "product_returns" USING btree ("retailer_id","order_number");--> statement-breakpoint
-- Facturas de proveedores ya cargadas: su fecha queda como la fecha en que se ingresaron
UPDATE "purchase_documents" SET "issue_date" = ("created_at" AT TIME ZONE 'America/Santiago')::date WHERE "issue_date" IS NULL;
