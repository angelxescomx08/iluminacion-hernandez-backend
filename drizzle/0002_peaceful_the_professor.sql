ALTER TABLE "products" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stripe_product_id_unique" UNIQUE("stripe_product_id");