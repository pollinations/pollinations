import {
    Alert,
    Button,
    CopyField,
    InlineLink,
    Section,
    Surface,
} from "@pollinations/ui";
import { useBlocker } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { config, genDocsUrl } from "../../config.ts";
import type {
    loadPrepaidQuote,
    submitPrepaidPayment,
} from "../../lib/prepaid-checkout.ts";

export function PrepaidCheckout() {
    const [amount, setAmount] = useState("2.00");
    const [quote, setQuote] = useState<Awaited<
        ReturnType<typeof loadPrepaidQuote>
    > | null>(null);
    const [pending, setPending] = useState<{
        url: string;
        headers: Record<string, string>;
    } | null>(null);
    const [result, setResult] = useState<Awaited<
        ReturnType<typeof submitPrepaidPayment>
    > | null>(null);
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const [error, setError] = useState<string>();
    useBlocker({
        disabled: !busy && !pending && (!result || saved),
        enableBeforeUnload: true,
        shouldBlockFn: () =>
            !window.confirm(
                "Leaving loses this checkout and any unsaved prepaid key. Leave anyway?",
            ),
    });

    async function checkout() {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError(undefined);
        let sending = Boolean(pending);
        try {
            const api = await import("../../lib/prepaid-checkout.ts");
            const value = api.prepaidAmount(amount);
            const url = `${config.apiBaseUrl}/x402/keys/${value}`;
            if (!quote) {
                setQuote(await api.loadPrepaidQuote(url, value));
                return;
            }
            let payment = pending;
            if (!payment) {
                const signer = await api.connectPrepaidWallet();
                payment = {
                    url,
                    headers: await api.prepaidPaymentHeaders(
                        quote,
                        value,
                        signer,
                    ),
                };
                setPending(payment);
            }
            sending = true;
            setResult(
                await api.submitPrepaidPayment(payment.url, payment.headers),
            );
            setPending(null);
        } catch {
            setError(
                sending
                    ? "Payment is not confirmed. Keep this page open and retry this payment to recover the same key without paying again."
                    : !quote
                      ? "Couldn’t get a payment quote. Choose an amount from $0.01 to $10,000 in cents and try again later if checkout is unavailable."
                      : "Wallet approval didn’t complete. Use a browser with an Ethereum wallet, check its connection and USDC balance on Base, then try again.",
            );
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    }

    return (
        <Section title="Buy prepaid Pollen">
            <Surface className="space-y-4">
                <p>
                    Buy a prepaid API key with USDC on Base. No Pollinations
                    account or sign-in required.
                </p>
                <p className="text-theme-text-muted">
                    This creates a separate key with its own Pollen budget. Save
                    it yourself: it will not appear in an account, and closing
                    this page loses your copy.
                </p>
                {result ? (
                    <div className="space-y-4" aria-live="polite">
                        <Alert intent="info">
                            Your key is ready with {result.pollen} Pollen.
                        </Alert>
                        <CopyField
                            label="Copy prepaid API key"
                            value={result.key}
                            onCopyError={() =>
                                setError(
                                    "Copy failed. Select the key and copy it manually.",
                                )
                            }
                        />
                        <p>
                            Keep this key secret. Use it as your API key at
                            gen.pollinations.ai.
                        </p>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={saved}
                                onChange={(event) =>
                                    setSaved(event.target.checked)
                                }
                            />
                            I have saved my prepaid key somewhere safe.
                        </label>
                    </div>
                ) : (
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void checkout();
                        }}
                    >
                        <label
                            className="flex flex-col gap-2"
                            htmlFor="prepaid-amount"
                        >
                            Amount in USDC (1 USDC = 1 Pollen)
                            <input
                                id="prepaid-amount"
                                className="polli-input rounded-lg border px-3 py-2"
                                type="number"
                                min="0.01"
                                max="10000"
                                step="0.01"
                                required
                                value={amount}
                                disabled={busy || Boolean(pending)}
                                onChange={(event) => {
                                    setAmount(event.target.value);
                                    setQuote(null);
                                    setError(undefined);
                                }}
                            />
                        </label>
                        {quote && (
                            <div className="space-y-2" aria-live="polite">
                                <p>
                                    Pay {Number(amount).toFixed(2)} USDC on Base
                                    for {Number(amount)} Pollen.
                                </p>
                                <p className="break-all text-sm text-theme-text-muted">
                                    Recipient: {quote.accepts[0].payTo}
                                </p>
                                <p className="text-sm text-theme-text-muted">
                                    Your wallet will ask you to approve this
                                    payment.
                                </p>
                            </div>
                        )}
                        <Button type="submit" intent="brand" disabled={busy}>
                            {busy
                                ? "Processing…"
                                : pending
                                  ? "Retry this payment"
                                  : quote
                                    ? `Connect wallet and pay ${Number(amount).toFixed(2)} USDC`
                                    : "Review payment"}
                        </Button>
                        {pending && (
                            <p role="status">
                                Keep this page open. Retrying uses the same
                                payment authorization.
                            </p>
                        )}
                    </form>
                )}
                {error && <Alert intent="danger">{error}</Alert>}
                <p className="text-sm text-theme-text-muted">
                    <InlineLink href={genDocsUrl("#tag/x402-prepaid-keys")}>
                        x402 API instructions
                    </InlineLink>
                    {" · "}
                    <InlineLink href="/sign-in?next=%2Fpollen">
                        Sign in to top up your account by card
                    </InlineLink>
                    {" · "}
                    <InlineLink href="/terms">Terms</InlineLink>
                    {" · "}
                    <InlineLink href="/refunds">Refunds</InlineLink>
                    {" · "}
                    <InlineLink href="mailto:billing@pollinations.ai">
                        Payment help
                    </InlineLink>
                </p>
            </Surface>
        </Section>
    );
}
