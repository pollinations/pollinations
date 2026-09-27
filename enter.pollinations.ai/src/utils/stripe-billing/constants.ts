import type Stripe from "stripe";

export const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
export const METADATA_USER_ID = "pollinations_user_id";
export const METADATA_PURPOSE = "pollinations_purpose";
export const AUTO_TOP_UP_PURPOSE = "auto_top_up";
export const AUTO_TOP_UP_CLAIM_TTL_MS = 5 * 60 * 1000;
export const AUTO_TOP_UP_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The `stripe_auto_top_up_attempt.status` state machine, named once:
 *
 *   `claimed`  → attempt row reserved, invoice not yet created/linked.
 *   `pending`  → invoice created, awaiting payment (webhook or reconciliation).
 *   `paid`     → invoice paid and Pollen credited exactly once.
 *   `failed`   → terminal failure; may disable auto top-up.
 *
 * Transitions are enforced by `WHERE status IN (...)` guards in the
 * auto-top-up module rather than a single place in shared code.
 */
export const AUTO_TOP_UP_ATTEMPT_STATUS = {
    CLAIMED: "claimed",
    FAILED: "failed",
    PAID: "paid",
    PENDING: "pending",
} as const;

export const BILLING_PORTAL_CONFIGURATION_METADATA_KEY = "pollinations_portal";
export const BILLING_PORTAL_CONFIGURATION_METADATA_VALUE = "billing_details_v1";
export const BILLING_PORTAL_CONFIGURATION_NAME = "Pollinations Billing Portal";
export const BILLING_PORTAL_HEADLINE =
    "Manage your payment methods, billing details, and invoices.";
export const BILLING_PORTAL_CUSTOMER_UPDATES = [
    "name",
    "address",
    "tax_id",
] satisfies Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[];

export const DEFAULT_AUTO_TOP_UP_AMOUNT_USD = 20;
