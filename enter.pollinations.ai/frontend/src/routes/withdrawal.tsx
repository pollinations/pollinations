import { Button, FieldStack, InlineLink, Input } from "@pollinations/ui";
import { AuthFlowLayout } from "@pollinations/ui/auth";
import { WITHDRAWAL_LIMITS, WITHDRAWAL_STATEMENT } from "@shared/withdrawal.ts";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { authClient } from "../auth.ts";
import { config } from "../config.ts";
import { pageTitle } from "../page-meta.ts";

export const Route = createFileRoute("/withdrawal")({
    head: () => ({ meta: [{ title: pageTitle("/withdrawal") }] }),
    component: WithdrawalPage,
});

type Declaration = { name: string; email: string; purchase: string };
type Receipt = Declaration & { id: string; receivedAt: string };

// Keep retries idempotent even after a reload, without storing the customer's
// name, contact details or purchase description in browser storage.
async function requestId(signature: string, fallback: string) {
    const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(signature),
    );
    const key = `withdrawal:${btoa(String.fromCharCode(...new Uint8Array(hash)))}`;
    try {
        const existing = sessionStorage.getItem(key);
        if (existing) return existing;
        sessionStorage.setItem(key, fallback);
    } catch {
        // Storage may be disabled. The open form still reuses its request ID.
    }
    return fallback;
}

function WithdrawalPage() {
    const { data: session } = authClient.useSession();
    const [name, setName] = useState<string>();
    const [email, setEmail] = useState<string>();
    const [purchase, setPurchase] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState<Receipt>();
    const receiptRef = useRef<HTMLElement>(null);
    const lastAttempt = useRef<{ details: string; id: string } | null>(null);

    useEffect(() => {
        if (receipt) receiptRef.current?.focus();
    }, [receipt]);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sending) return;
        setSending(true);
        setError("");
        const details = {
            name: (name ?? session?.user.name ?? "").trim(),
            email: (email ?? session?.user.email ?? "").trim(),
            purchase: purchase.trim(),
        };
        try {
            const signature = JSON.stringify(details);
            if (lastAttempt.current?.details !== signature) {
                lastAttempt.current = {
                    details: signature,
                    id: crypto.randomUUID(),
                };
            }
            const id = await requestId(signature, lastAttempt.current.id);
            const response = await fetch(`${config.apiBaseUrl}/withdrawals`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, ...details }),
            });
            if (response.status === 429) {
                setError(
                    "Too many submissions. Try again later or email billing.",
                );
                return;
            }
            if (response.status === 400) {
                setError(
                    "Check your name, purchase details and confirmation email, then try again.",
                );
                return;
            }
            if (response.status === 409) {
                setError(
                    "This reference belongs to a different declaration. Email billing to check your withdrawal.",
                );
                return;
            }
            if (!response.ok) throw new Error("Receipt unavailable");
            const confirmation = (await response.json()) as Partial<Receipt>;
            if (
                confirmation.id !== id ||
                typeof confirmation.receivedAt !== "string" ||
                !Number.isFinite(Date.parse(confirmation.receivedAt))
            ) {
                throw new Error("Invalid receipt");
            }
            setReceipt({ ...details, id, receivedAt: confirmation.receivedAt });
        } catch {
            setError(
                "We couldn’t confirm receipt. Try again with the same details or email billing.",
            );
        } finally {
            setSending(false);
        }
    }

    const receiptText =
        receipt &&
        [
            "Myceli.AI OÜ · Pollinations withdrawal receipt",
            `Reference: ${receipt.id}`,
            `Received (UTC): ${receipt.receivedAt}`,
            "",
            WITHDRAWAL_STATEMENT,
            `Name: ${receipt.name}`,
            `Credit top-up: ${receipt.purchase}`,
            `Confirmation email: ${receipt.email}`,
        ].join("\n");

    return (
        <AuthFlowLayout
            title={
                receipt
                    ? "Withdrawal received"
                    : "Withdraw from your credit top-up contract"
            }
            footnote={
                <InlineLink href="mailto:billing@pollinations.ai">
                    billing@pollinations.ai
                </InlineLink>
            }
        >
            {receipt && receiptText ? (
                <section
                    className="grid gap-4 text-sm"
                    aria-label="Withdrawal receipt"
                    tabIndex={-1}
                    ref={receiptRef}
                >
                    <p role="status">
                        We received your declaration. A copy will be sent to{" "}
                        {receipt.email}.
                    </p>
                    <pre className="whitespace-pre-wrap break-words font-body">
                        {receiptText}
                    </pre>
                    <InlineLink
                        external={false}
                        download={`withdrawal-${receipt.id}.txt`}
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(receiptText)}`}
                    >
                        Save receipt
                    </InlineLink>
                </section>
            ) : (
                <form
                    className="grid gap-4"
                    onSubmit={submit}
                    aria-busy={sending}
                >
                    <p>{WITHDRAWAL_STATEMENT}</p>
                    <FieldStack label="Your name">
                        <Input
                            name="name"
                            autoComplete="name"
                            required
                            pattern=".*\S.*"
                            maxLength={WITHDRAWAL_LIMITS.name}
                            value={name ?? session?.user.name ?? ""}
                            onChange={(e) => setName(e.target.value)}
                            disabled={sending}
                        />
                    </FieldStack>
                    <FieldStack
                        label="Credit top-up"
                        helper="Enter the order or invoice number, or describe the purchase by its date and amount."
                    >
                        <Input
                            name="purchase"
                            required
                            pattern=".*\S.*"
                            maxLength={WITHDRAWAL_LIMITS.purchase}
                            value={purchase}
                            onChange={(e) => setPurchase(e.target.value)}
                            disabled={sending}
                        />
                    </FieldStack>
                    <FieldStack
                        label="Confirmation email"
                        helper="We’ll send your withdrawal receipt to this address."
                    >
                        <Input
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            maxLength={WITHDRAWAL_LIMITS.email}
                            value={email ?? session?.user.email ?? ""}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={sending}
                        />
                    </FieldStack>
                    {error && (
                        <p role="alert" className="text-intent-danger-text">
                            {error}
                        </p>
                    )}
                    <Button type="submit" intent="commit" disabled={sending}>
                        {sending ? "Submitting…" : "Confirm withdrawal"}
                    </Button>
                </form>
            )}
        </AuthFlowLayout>
    );
}
