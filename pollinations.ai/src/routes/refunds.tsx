import { Button, FieldStack, Input } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { withdrawalStatement } from "../refund-email";
import { routeHead } from "../routeMeta";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/refunds")({
    head: () => routeHead("/refunds"),
    component: RefundsPage,
});

function RefundsPage() {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [sentTo, setSentTo] = useState("");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sending) return;
        const data = new FormData(event.currentTarget);
        const email = String(data.get("email")).trim();
        const body = new URLSearchParams({
            name: String(data.get("name")),
            purchase: String(data.get("purchase")),
            email,
        });
        setSending(true);
        setError("");
        try {
            const response = await fetch("/refunds", { method: "POST", body });
            if (response.status === 204) setSentTo(email);
            else if (response.status === 429)
                setError(
                    "Please wait a minute before sending another request, or email billing@pollinations.ai.",
                );
            else if (response.status === 400)
                setError(
                    "Please check your name, purchase details and email address.",
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
            <details className="rounded-card border border-divider p-4">
                <summary className="cursor-pointer font-semibold">
                    <span>Withdraw from contract here</span>
                    <span className="mt-1 block text-sm font-normal text-theme-text-muted">
                        If you bought credit for personal use in the European
                        Economic Area, you usually have 14 days from purchase to
                        withdraw.
                    </span>
                </summary>
                {sentTo ? (
                    <p className="mt-3" role="status">
                        Billing received your request. We sent a dated copy to{" "}
                        {sentTo}.
                    </p>
                ) : (
                    <form
                        className="mt-4 grid max-w-lg gap-3"
                        method="post"
                        action="/refunds"
                        onSubmit={submit}
                    >
                        <p>{withdrawalStatement}</p>
                        <FieldStack
                            label="Email for your copy"
                            helper="Your Pollinations account email helps billing find your purchase. You can also use another address."
                        >
                            <Input
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                            />
                        </FieldStack>
                        <FieldStack
                            label="Credit top-up"
                            helper="Enter an order or invoice number, or the date and amount. You can also include your account ID from Account → Profile."
                        >
                            <Input name="purchase" required maxLength={300} />
                        </FieldStack>
                        <FieldStack label="Your name">
                            <Input
                                name="name"
                                autoComplete="name"
                                required
                                maxLength={120}
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
