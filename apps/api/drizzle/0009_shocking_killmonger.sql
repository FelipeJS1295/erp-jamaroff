CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERADOR', 'LECTURA');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"role" "user_role" DEFAULT 'LECTURA' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
