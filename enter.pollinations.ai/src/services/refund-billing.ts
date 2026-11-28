import { WorkerEntrypoint } from "cloudflare:workers";
import type Stripe from "stripe";
import { createStripeClient } from "../utils/stripe.ts";
import { getStripeId } from "../utils/stripe-billing/customer.ts";
import { accountEmailSender, billingAddress } from "./account-notices.ts";

async function matchesPaidInvoice(
    stripe: Stripe,
    accountId: string,
    customerId: string | null,
    invoiceNumber: string,
): Promise<boolean> {
    const matches = (invoice: Stripe.Invoice) =>
        invoice.number === invoiceNumber &&
        invoice.status === "paid" &&
        invoice.amount_paid > 0;

    // Listing includes freshly paid invoices before they reach Stripe's search index.
    if (customerId) {
        const recent = stripe.invoices.list({
            customer: customerId,
            status: "paid",
            created: { gte: Math.floor(Date.now() / 1000) - 86400 },
            limit: 100,
        });
        for await (const invoice of recent) {
            if (matches(invoice)) return true;
        }
    }

    const results = stripe.invoices.search({
        query: `number:${JSON.stringify(invoiceNumber)}`,
        limit: 100,
    });
    for await (const invoice of results) {
        if (!matches(invoice)) continue;
        const owner = getStripeId(invoice.customer);
        if (!owner) continue;
        if (owner === customerId) return true;
        // Older checkouts created a new Stripe customer for each purchase.
        const sessions = stripe.checkout.sessions.list({
            customer: owner,
            status: "complete",
            limit: 100,
        });
        for await (const session of sessions) {
            if (
                getStripeId(session.invoice) === invoice.id &&
                session.metadata?.userId === accountId
            )
                return true;
        }
    }
    return false;
}

export class RefundBilling extends WorkerEntrypoint<CloudflareBindings> {
    async submitWithdrawal(
        accountId: string,
        invoiceNumber: string,
    ): Promise<boolean> {
        const received = new Date().toISOString();
        const account = await this.env.DB.prepare(
            "SELECT name, email, stripe_customer_id FROM user WHERE id = ?",
        )
            .bind(accountId)
            .first<{
                name: string;
                email: string;
                stripe_customer_id: string | null;
            }>();
        if (
            !account ||
            !(await matchesPaidInvoice(
                createStripeClient(this.env),
                accountId,
                account.stripe_customer_id,
                invoiceNumber,
            ))
        )
            return false;

        await this.env.EMAIL.send({
            from: accountEmailSender,
            to: billingAddress,
            cc: [account.email],
            replyTo: billingAddress,
            subject: "Credit top-up withdrawal received",
            text: [
                "Pollinations billing received this request and will review the purchase.",
                "",
                "I withdraw from the credit top-up purchase identified below.",
                `Invoice number: ${invoiceNumber}`,
                `Pollinations account ID: ${accountId}`,
                `Account name: ${account.name}`,
                `Received (UTC): ${received}`,
            ].join("\n"),
        });
        return true;
    }
}
