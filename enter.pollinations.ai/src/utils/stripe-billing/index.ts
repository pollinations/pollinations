/**
 * Public surface of the Stripe billing module.
 *
 * Split by concern (customer / portal / billing-details / auto-top-up /
 * invoice-verification / billing-overview) purely for readability — this barrel
 * preserves the original flat `stripe-billing.ts` export list behind the new
 * directory entry point.
 */
export {
    creditAutoTopUpInvoice,
    markAutoTopUpInvoiceFailed,
    processAutoTopUpForUser,
    updateAutoTopUpSettings,
} from "./auto-top-up.ts";
export { getBillingOverview } from "./billing-overview.ts";
export { getOrCreateStripeCustomerId } from "./customer.ts";
export { createBillingPortalSession } from "./portal.ts";
export type { AutoTopUpIssue, BillingOverview } from "./types.ts";
