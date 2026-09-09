import {
    calculateServiceFeeCents,
    POLLEN_PACK_LINE_TYPE,
    SERVICE_FEE_LINE_TYPE,
} from "@shared/pollen-packs.ts";
import type Stripe from "stripe";
import { createStripeClient } from "../stripe.ts";
import type { AutoTopUpAttemptRow } from "./types.ts";

/**
 * Verifies an auto top-up invoice actually carries the amount this attempt was
 * created for before crediting Pollen. Checks run top-to-bottom and the first
 * failure reason is returned verbatim, so ordering is load-bearing.
 */
export async function verifyAutoTopUpInvoicePayment(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
    attempt: AutoTopUpAttemptRow,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (invoice.status !== "paid") {
        return { ok: false, reason: "invoice status is not paid" };
    }

    if (invoice.currency !== "usd") {
        return { ok: false, reason: "currency mismatch" };
    }

    const expectedPackAmountCents = attempt.amountUsd * 100;
    const expectedServiceFeeCents = calculateServiceFeeCents(
        expectedPackAmountCents,
    );
    const expectedMinimumPaidCents =
        expectedPackAmountCents + expectedServiceFeeCents;

    const lines = await getInvoiceLinesForVerification(env, invoice);
    // No lines surfaced: fall back to comparing the paid amount against the
    // expected minimum rather than failing outright.
    if (lines.length === 0) {
        if (invoice.amount_paid < expectedMinimumPaidCents) {
            return { ok: false, reason: "amount mismatch" };
        }
        return { ok: true };
    }

    if (lines.some((line) => getInvoiceLineAmountCents(line) < 0)) {
        return { ok: false, reason: "unexpected negative invoice line" };
    }

    const packLines = lines.filter(
        (line) => line.metadata?.line_type === POLLEN_PACK_LINE_TYPE,
    );
    if (packLines.length !== 1) {
        return { ok: false, reason: "wrong pollen pack line count" };
    }
    if (getInvoiceLineAmountCents(packLines[0]) !== expectedPackAmountCents) {
        return { ok: false, reason: "pack line amount mismatch" };
    }

    const serviceFeeLines = lines.filter(
        (line) => line.metadata?.line_type === SERVICE_FEE_LINE_TYPE,
    );
    if (serviceFeeLines.length !== 1) {
        return { ok: false, reason: "wrong service fee line count" };
    }
    if (
        getInvoiceLineAmountCents(serviceFeeLines[0]) !==
        expectedServiceFeeCents
    ) {
        return { ok: false, reason: "service fee amount mismatch" };
    }

    if (invoice.amount_paid < expectedMinimumPaidCents) {
        return { ok: false, reason: "amount mismatch" };
    }

    return { ok: true };
}

async function getInvoiceLinesForVerification(
    env: CloudflareBindings,
    invoice: Stripe.Invoice,
): Promise<Stripe.InvoiceLineItem[]> {
    const inlineLines = invoice.lines?.data ?? [];
    if (inlineLines.length > 0 && !invoice.lines?.has_more) {
        return inlineLines;
    }

    try {
        const stripe = createStripeClient(env);
        const lines = await stripe.invoices.listLineItems(invoice.id, {
            limit: 100,
        });
        return lines.data;
    } catch (error) {
        console.warn("[auto-top-up] invoice line lookup failed", {
            invoiceId: invoice.id,
            error: error instanceof Error ? error.message : String(error),
        });
        return inlineLines;
    }
}

function getInvoiceLineAmountCents(line: Stripe.InvoiceLineItem): number {
    return line.amount;
}
