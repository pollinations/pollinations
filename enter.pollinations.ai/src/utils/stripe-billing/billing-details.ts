import type Stripe from "stripe";
import type { BillingOverview } from "./types.ts";

export function isBillingDetailsComplete(
    customer: Stripe.Customer,
    paymentMethod: Stripe.PaymentMethod | null,
): boolean {
    const details = getBillingDetailsSummary(customer, paymentMethod);
    return (
        !!(details?.name || details?.company) && isTaxLocationComplete(details)
    );
}

function isTaxLocationComplete(
    details: NonNullable<BillingOverview["billingDetails"]>,
): boolean {
    const country = details.country?.toUpperCase();
    if (!country) return false;

    if (country === "US") {
        return !!details.postalCode;
    }

    if (country === "CA" || country === "IN") {
        return !!(details.postalCode || details.state);
    }

    return true;
}

export function getBillingDetailsSummary(
    customer: Stripe.Customer,
    paymentMethod: Stripe.PaymentMethod | null,
    taxIds: Stripe.TaxId[] = [],
): BillingOverview["billingDetails"] {
    // One whole address, chosen the way Stripe Tax chooses: the customer's
    // when any field is set (kept even if incomplete, as Stripe then fails
    // rather than falling back), else the default card's. Mixing fields from
    // both builds an address that exists nowhere.
    const address = Object.values(customer.address ?? {}).some(Boolean)
        ? customer.address
        : paymentMethod?.billing_details?.address;

    return {
        name: firstString(
            customer.individual_name,
            customer.name,
            paymentMethod?.billing_details?.name,
        ),
        company: firstString(customer.business_name),
        taxIds: taxIds.map((taxId) => ({
            type: taxId.type,
            value: taxId.value,
            verification: taxId.verification?.status ?? null,
        })),
        email: firstString(
            customer.email,
            paymentMethod?.billing_details?.email,
        ),
        line1: address?.line1 || null,
        line2: address?.line2 || null,
        city: address?.city || null,
        state: address?.state || null,
        postalCode: address?.postal_code || null,
        country: address?.country || null,
    };
}

function firstString(
    ...values: Array<string | null | undefined>
): string | null {
    return values.find((value) => typeof value === "string" && value) ?? null;
}
