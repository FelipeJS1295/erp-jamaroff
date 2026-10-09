ALTER TABLE "retailer_products" ADD COLUMN "status" varchar(40);--> statement-breakpoint
ALTER TABLE "retailer_products" ADD COLUMN "stock" integer;--> statement-breakpoint
ALTER TABLE "retailer_products" ADD COLUMN "image_url" varchar(500);