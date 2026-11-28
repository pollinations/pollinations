import { Button, FieldStack, Input } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { routeHead } from "../routeMeta";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/refunds")({
    head: () => routeHead("/refunds"),
    component: RefundsPage,
});

function RefundsPage() {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sending) return;
        const data = new FormData(event.currentTarget);
        const body = new URLSearchParams({
            invoiceNumber: String(data.get("invoiceNumber")),
            accountId: String(data.get("accountId")),
        });
        setSending(true);
        setError("");
        try {
            const response = await fetch("/refunds", { method: "POST", body });
            if (response.status === 204) setSent(true);
            else if (response.status === 429)
                setError(
                    "Please wait a minute before sending another request, or email billing@pollinations.ai.",
                );
            else if (response.status === 400 || response.status === 422)
                setError(
                    "We couldn’t match that invoice number and account ID. Check both and try again.",
                );
            else throw new Error();
        } catch {
            setError(
                "We couldn’t confirm delivery. Please email billing@pollinations.ai with your purchase details.",
            );
        } finally {
            setSending(false);
        }
    }

    return (
        <LegalPage
            markdownPath="/legal/REFUNDS_AND_CANCELLATIONS.md"
            errorLabel="refunds policy"
        >
            <details
                id="withdrawal"
                className="rounded-card border border-divider p-4"
            >
                <summary className="cursor-pointer font-semibold">
                    <span>Withdraw from contract here</span>
                    <span className="mt-1 block text-sm font-normal text-theme-text-muted">
                        If you bought credit for personal use in the European
                        Economic Area, you usually have 14 days from purchase to
                        withdraw.
                    </span>
                </summary>
                {sent ? (
                    <p className="mt-3" role="status">
                        Billing received your request. We sent a dated copy to
                        your Pollinations account email.
                    </p>
                ) : (
                    <form
                        className="mt-4 grid max-w-lg gap-3"
                        method="post"
                        action="/refunds"
                        onSubmit={submit}
                    >
                        <p>
                            I withdraw from the credit top-up purchase
                            identified below. Please use my Pollinations account
                            details and send the dated copy to my account email.
                        </p>
                        <FieldStack
                            label="Invoice number"
                            helper="Copy the invoice number from your Stripe invoice."
                        >
                            <Input
                                name="invoiceNumber"
                                required
                                maxLength={128}
                                spellCheck={false}
                                autoCapitalize="none"
                            />
                        </FieldStack>
                        <FieldStack
                            label="Pollinations account ID"
                            helper="Find your ID under Account → Profile."
                        >
                            <Input
                                name="accountId"
                                required
                                maxLength={128}
                                spellCheck={false}
                                autoCapitalize="none"
                            />
                        </FieldStack>
                        <Button
                            className="w-fit"
                            type="submit"
                            intent="commit"
                            disabled={sending}
                        >
                            {sending ? "Sending…" : "Confirm withdrawal"}
                        </Button>
                        {error && <p role="alert">{error}</p>}
                    </form>
                )}
            </details>
        </LegalPage>
    );
}
