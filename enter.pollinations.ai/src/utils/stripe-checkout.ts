import {
    calculateServiceFeeCents,
    type PollenPack,
    SERVICE_FEE_NAME,
    SERVICE_FEE_TAX_CODE,
} from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { createStripeClient } from "./stripe.ts";
import { getOrCreateStripeCustomerId } from "./stripe-billing.ts";
import {
    getStripeNewCardGateStatus,
    stripeNewCardGateMetadata,
} from "./stripe-card-gate.ts";

export type PackCheckoutMode = "customer" | "guest";

type CreatePackCheckoutSessionOptions = {
    env: CloudflareBindings;
    userId: string;
    pack: PollenPack;
    cohort: string;
    successUrl: string;
    cancelUrl: string;
    mode: PackCheckoutMode;
    metadata?: Record<string, string>;
    expiresAfterSeconds?: number;
    idempotencyKey?: string;
};

/** Shared Stripe Checkout construction for dashboard and BYOP pack purchases. */
export async function createPackCheckoutSession({
    env,
    userId,
    pack,
    cohort,
    successUrl,
    cancelUrl,
    mode,
    metadata,
    expiresAfterSeconds,
    idempotencyKey,
}: CreatePackCheckoutSessionOptions): Promise<Stripe.Checkout.Session> {
    // Fail closed when the dedicated checkout PMC is missing. Falling back to
    // Stripe's account default would hide a misconfigured deployment.
    const pmcId = env.STRIPE_PMC;
    if (!pmcId) {
        throw new Error(
            `Missing required env var STRIPE_PMC for checkout on ${env.ENVIRONMENT}`,
        );
    }

    const stripe = createStripeClient(env);
    const [stripeCustomerId, newCardGate] = await Promise.all([
        mode === "customer"
            ? getOrCreateStripeCustomerId(env, userId)
            : Promise.resolve(null),
        getStripeNewCardGateStatus(env.DB, userId),
    ]);
    const packMetadata = {
        userId,
        packKey: pack.packKey,
        cohort,
        ...metadata,
        ...stripeNewCardGateMetadata(newCardGate),
    };
    const serviceFeeCents = calculateServiceFeeCents(pack.amountUsd * 100);
    const expiresAt =
        expiresAfterSeconds == null
            ? undefined
            : Math.floor(Date.now() / 1000) + expiresAfterSeconds;

    return stripe.checkout.sessions.create(
        {
            mode: "payment",
            payment_method_configuration: pmcId,
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        unit_amount: pack.amountUsd * 100,
                        tax_behavior: "exclusive",
                        product_data: {
                            name: pack.checkoutName,
                            description: pack.checkoutDescription,
                            images: [pack.checkoutImageUrl],
                            tax_code: pack.taxCode,
                        },
                    },
                    quantity: 1,
                },
                {
                    price_data: {
                        currency: "usd",
                        unit_amount: serviceFeeCents,
                        tax_behavior: "exclusive",
                        product_data: {
                            name: SERVICE_FEE_NAME,
                            tax_code: SERVICE_FEE_TAX_CODE,
                        },
                    },
                    quantity: 1,
                },
            ],
            adaptive_pricing: { enabled: true },
            allow_promotion_codes: true,
            automatic_tax: { enabled: true },
            billing_address_collection: "auto",
            tax_id_collection: { enabled: true },
            ...(stripeCustomerId && {
                customer: stripeCustomerId,
                customer_update: {
                    address: "auto" as const,
                    name: "auto" as const,
                },
            }),
            payment_intent_data: {
                metadata: packMetadata,
            },
            invoice_creation: {
                enabled: true,
                invoice_data: {
                    rendering_options: {
                        amount_tax_display: "exclude_tax",
                    },
                },
            },
            metadata: packMetadata,
            success_url: successUrl,
            cancel_url: cancelUrl,
            ...(expiresAt != null && { expires_at: expiresAt }),
        },
        idempotencyKey ? { idempotencyKey } : undefined,
    );
}
