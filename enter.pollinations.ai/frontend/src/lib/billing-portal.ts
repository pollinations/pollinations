import type { PollenPackKey } from "@shared/pollen-packs.ts";
import { useEffect, useRef } from "react";
import { apiClient } from "../api.ts";

/**
 * A button that says "Opening…" while the page leaves for Stripe stays that
 * way if the buyer comes Back: the browser restores the page as it was. Call
 * `reset` then, so it works again.
 */
export function useResetWhenShownAgain(reset: () => void): void {
    const latest = useRef(reset);
    latest.current = reset;
    useEffect(() => {
        const onShow = (event: PageTransitionEvent) => {
            if (event.persisted) latest.current();
        };
        window.addEventListener("pageshow", onShow);
        return () => window.removeEventListener("pageshow", onShow);
    }, []);
}

/**
 * Straight to one task, then back here: "card" adds a card (made the
 * default), "details" edits name, company, address and VAT ID.
 */
export type BillingPortalFlow = "card" | "details";

/**
 * Open Stripe's Billing Portal, where the buyer edits cards, name, company,
 * VAT ID and address; with `flow`, straight to one of them. Navigates away
 * on success; returns the error message otherwise.
 */
export async function openBillingPortal(
    returnToTopUp?: { redirect?: string },
    flow?: BillingPortalFlow,
    /** Selected again on return, so the buyer finds the pack they chose. */
    pack?: PollenPackKey,
): Promise<string> {
    try {
        const response = await apiClient.stripe.billing.portal.$post({
            json: {
                ...(returnToTopUp && {
                    return: "top-up",
                    redirect: returnToTopUp.redirect,
                }),
                ...(flow && { flow }),
                ...(pack && { pack }),
            },
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
