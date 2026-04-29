-- Clean up placeholder/corrupt Stripe customer IDs from development or failed migrations.
-- Real Stripe customer IDs start with `cus_`; invalid values would break billing links.
UPDATE "user"
SET "stripe_customer_id" = NULL
WHERE "stripe_customer_id" IS NOT NULL
  AND "stripe_customer_id" NOT GLOB 'cus_*';

--> statement-breakpoint
DELETE FROM "stripe_customer_link"
WHERE "stripe_customer_id" NOT GLOB 'cus_*';
