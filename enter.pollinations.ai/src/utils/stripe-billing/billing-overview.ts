import { AUTO_TOP_UP_THRESHOLD_POLLEN } from "@shared/billing/auto-top-up.ts";
import { calculateServiceFeeCents } from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe.ts";
import { STRIPE_PAYMENT_SUPPORT_EMAIL } from "../stripe-payment-restriction.ts";
import {
    getBillingDetailsSummary,
    isBillingDetailsComplete,
} from "./billing-details.ts";
import {
    AUTO_TOP_UP_ATTEMPT_STATUS,
    DEFAULT_AUTO_TOP_UP_AMOUNT_USD,
} from "./constants.ts";
import {
    getDefaultPaymentMethod,
    getUserStripeBillingRow,
    retrieveActiveCustomer,
} from "./customer.ts";
import type { AutoTopUpIssue, BillingOverview } from "./types.ts";

export async function getBillingOverview(
    env: CloudflareBindings,
    userId: string,
): Promise<BillingOverview> {
    const stripe = createStripeClient(env);
    const user = await getUserStripeBillingRow(env.DB, userId);
    const customer = user.stripeCustomerId
        ? await retrieveActiveCustomer(stripe, user.stripeCustomerId)
        : null;
    const paymentMethod = customer
        ? await getDefaultPaymentMethod(stripe, customer)
        : null;
    const billingDetailsComplete = customer
        ? isBillingDetailsComplete(customer, paymentMethod)
        : false;
    const paymentRestricted = user.stripePaymentRestriction !== null;
    const autoTopUpEnabled =
        !paymentRestricted &&
        user.autoTopUpEnabled &&
        !!paymentMethod &&
        billingDetailsComplete;

    const lastIssue = await getLastAutoTopUpIssue(env.DB, stripe, userId);
    const packAmountUsd =
        user.autoTopUpAmountUsd ?? DEFAULT_AUTO_TOP_UP_AMOUNT_USD;

    return {
        paymentAccess: {
            restricted: paymentRestricted,
            supportEmail: STRIPE_PAYMENT_SUPPORT_EMAIL,
        },
        autoTopUp: {
            enabled: autoTopUpEnabled,
            thresholdPollen: AUTO_TOP_UP_THRESHOLD_POLLEN,
            packAmountUsd,
            serviceFeeCents: calculateServiceFeeCents(packAmountUsd * 100),
            lastIssue,
        },
        paymentMethod: paymentMethod
            ? {
                  hasDefault: true,
                  brand: paymentMethod.card?.brand ?? "card",
                  last4: paymentMethod.card?.last4 ?? null,
              }
            : { hasDefault: false, brand: null, last4: null },
        billingDetails: customer
            ? getBillingDetailsSummary(customer, paymentMethod)
            : null,
        billingDetailsComplete,
    };
}

async function getLastAutoTopUpIssue(
    db: D1Database,
    stripe: Stripe,
    userId: string,
): Promise<AutoTopUpIssue | null> {
    const row = await db
        .prepare(
            `SELECT status, failure_reason, completed_at, updated_at, created_at, stripe_invoice_id
                FROM stripe_auto_top_up_attempt
                WHERE user_id = ?
                ORDER BY COALESCE(completed_at, updated_at, created_at) DESC
                LIMIT 1`,
        )
        .bind(userId)
        .first<{
            status: string;
            failure_reason: string | null;
            completed_at: number | null;
            updated_at: number | null;
            created_at: number;
            stripe_invoice_id: string | null;
        }>();
    if (!row) return null;
    const occurredAtMs = row.completed_at ?? row.updated_at ?? row.created_at;
    if (row.status === AUTO_TOP_UP_ATTEMPT_STATUS.PENDING) {
        if (!row.stripe_invoice_id) return null;
        try {
            const invoice = await stripe.invoices.retrieve(
                row.stripe_invoice_id,
            );
            if (
                invoice.status === "open" &&
                typeof invoice.hosted_invoice_url === "string"
            ) {
                return {
                    kind: "pending_payment",
                    invoiceUrl: invoice.hosted_invoice_url,
                    occurredAt: new Date(occurredAtMs).toISOString(),
                };
            }
        } catch (error) {
            console.warn("[auto-top-up] pending invoice lookup failed", {
                invoiceId: row.stripe_invoice_id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
    if (row.status !== AUTO_TOP_UP_ATTEMPT_STATUS.FAILED) {
        return null;
    }
    return {
        kind: "failed",
        reason: row.failure_reason ?? "Auto top-up could not be completed.",
        occurredAt: new Date(occurredAtMs).toISOString(),
    };
}
