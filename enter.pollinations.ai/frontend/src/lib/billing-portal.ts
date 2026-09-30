import { apiClient } from "../api.ts";

/**
 * Open Stripe's Billing Portal, where the buyer edits cards, name, company,
 * VAT ID and address. Navigates away on success; returns the error message
 * otherwise.
 */
export async function openBillingPortal(returnToTopUp?: {
    redirect?: string;
}): Promise<string> {
    try {
        const response = await apiClient.stripe.billing.portal.$post({
            json: returnToTopUp
                ? { return: "top-up", redirect: returnToTopUp.redirect }
                : {},
        });
        const payload = (await response.json().catch(() => ({}))) as {
            url?: unknown;
            error?: unknown;
        };
        if (response.ok && typeof payload.url === "string") {
            window.location.href = payload.url;
            return "";
        }
        return typeof payload.error === "string"
            ? payload.error
            : "Couldn’t open Stripe.";
    } catch {
        return "Couldn’t open Stripe.";
    }
}
