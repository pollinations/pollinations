import { PUBLIC_URLS } from "@shared/public-urls.ts";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe.ts";
import {
    BILLING_PORTAL_CONFIGURATION_METADATA_KEY,
    BILLING_PORTAL_CONFIGURATION_METADATA_VALUE,
    BILLING_PORTAL_CONFIGURATION_NAME,
    BILLING_PORTAL_CUSTOMER_UPDATES,
    BILLING_PORTAL_HEADLINE,
} from "./constants.ts";
import { getOrCreateStripeCustomerId } from "./customer.ts";

export async function createBillingPortalSession(
    env: CloudflareBindings,
    userId: string,
): Promise<Stripe.BillingPortal.Session> {
    const stripe = createStripeClient(env);
    const customer = await getOrCreateStripeCustomerId(env, userId);
    const returnUrl = getBillingReturnUrl(env);
    const configuration = await ensureBillingPortalConfiguration(
        stripe,
        returnUrl,
        env.STRIPE_AUTO_TOP_UP_PMC_ID || undefined,
    );

    return stripe.billingPortal.sessions.create({
        customer,
        configuration,
        return_url: returnUrl,
    });
}

async function ensureBillingPortalConfiguration(
    stripe: Stripe,
    returnUrl: string,
    paymentMethodConfiguration: string | undefined,
): Promise<string> {
    const configurations = await stripe.billingPortal.configurations.list({
        active: true,
        limit: 100,
    });
    const existing = configurations.data.find(
        (configuration) =>
            configuration.metadata?.[
                BILLING_PORTAL_CONFIGURATION_METADATA_KEY
            ] === BILLING_PORTAL_CONFIGURATION_METADATA_VALUE,
    );

    if (existing) {
        if (
            isBillingPortalConfigurationCurrent(
                existing,
                paymentMethodConfiguration,
            )
        ) {
            return existing.id;
        }

        const updated = await stripe.billingPortal.configurations.update(
            existing.id,
            createBillingPortalConfigurationParams(
                returnUrl,
                paymentMethodConfiguration,
            ),
        );
        return updated.id;
    }

    const created = await stripe.billingPortal.configurations.create(
        createBillingPortalConfigurationParams(
            returnUrl,
            paymentMethodConfiguration,
        ),
        {
            idempotencyKey: `pollinations:stripe-billing-portal:${BILLING_PORTAL_CONFIGURATION_METADATA_VALUE}`,
        },
    );
    return created.id;
}

function createBillingPortalConfigurationParams(
    returnUrl: string,
    paymentMethodConfiguration: string | undefined,
): Stripe.BillingPortal.ConfigurationCreateParams {
    return {
        name: BILLING_PORTAL_CONFIGURATION_NAME,
        default_return_url: returnUrl,
        business_profile: {
            headline: BILLING_PORTAL_HEADLINE,
        },
        metadata: {
            [BILLING_PORTAL_CONFIGURATION_METADATA_KEY]:
                BILLING_PORTAL_CONFIGURATION_METADATA_VALUE,
        },
        features: {
            customer_update: {
                enabled: true,
                allowed_updates: BILLING_PORTAL_CUSTOMER_UPDATES,
            },
            invoice_history: {
                enabled: true,
            },
            payment_method_update: {
                enabled: true,
                ...(paymentMethodConfiguration && {
                    payment_method_configuration: paymentMethodConfiguration,
                }),
            },
        },
    };
}

function isBillingPortalConfigurationCurrent(
    configuration: Stripe.BillingPortal.Configuration,
    paymentMethodConfiguration: string | undefined,
): boolean {
    if (configuration.business_profile.headline !== BILLING_PORTAL_HEADLINE) {
        return false;
    }

    const customerUpdate = configuration.features.customer_update;
    if (!customerUpdate.enabled) return false;

    const allowedUpdates = new Set(customerUpdate.allowed_updates);
    if (
        !BILLING_PORTAL_CUSTOMER_UPDATES.every((update) =>
            allowedUpdates.has(update),
        )
    ) {
        return false;
    }

    const currentPmc =
        configuration.features.payment_method_update
            .payment_method_configuration;
    return (currentPmc ?? undefined) === paymentMethodConfiguration;
}

function getBillingReturnUrl(env: CloudflareBindings): string {
    const baseUrl = env.STRIPE_SUCCESS_URL || PUBLIC_URLS.enter.production;
    const url = new URL("/pollen", baseUrl);
    url.searchParams.set("stripe_billing_return", "true");
    return url.toString();
}
