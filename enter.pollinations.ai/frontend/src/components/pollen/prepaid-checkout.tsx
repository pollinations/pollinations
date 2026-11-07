import {
    Alert,
    Button,
    CopyField,
    InlineLink,
    Section,
    Surface,
} from "@pollinations/ui";
import { POLLEN_PACKS } from "@shared/pollen-packs.ts";
import { useBlocker } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { config, genDocsUrl } from "../../config.ts";
import type {
    connectPrepaidWallet,
    loadPrepaidQuote,
    submitPrepaidPayment,
} from "../../lib/prepaid-checkout.ts";

export function PrepaidCheckout({ onStart }: { onStart: () => void }) {
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
    const [wallet, setWallet] = useState<Awaited<
        ReturnType<typeof connectPrepaidWallet>
    > | null>(null);
    const [balance, setBalance] = useState<number | null>(null);
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
        onStart();
        inFlight.current = true;
        setBusy(true);
        setError(undefined);
        let sending = Boolean(pending);
        let api: typeof import("../../lib/prepaid-checkout.ts") | undefined;
        try {
            api = await import("../../lib/prepaid-checkout.ts");
            const value = api.prepaidAmount(amount);
            const url = `${config.apiBaseUrl}/x402/keys/${value}`;
            if (!quote) {
                setQuote(await api.loadPrepaidQuote(url, value));
                return;
            }
            let payment = pending;
            if (!payment) {
                if (!wallet) {
                    setWallet(await api.connectPrepaidWallet());
                    return;
                }
                payment = {
                    url,
                    headers: await api.prepaidPaymentHeaders(
                        quote,
                        value,
                        wallet,
                    ),
                };
                setPending(payment);
            }
            sending = true;
            setResult(
                await api.submitPrepaidPayment(payment.url, payment.headers),
            );
            setPending(null);
        } catch (error) {
            if (!sending) setWallet(null);
            setError(
                sending
                    ? "Payment is not confirmed. Keep this page open and retry this payment to recover the same key without paying again."
                    : !quote
                      ? "Couldn’t get a payment quote. Choose an amount from $0.01 to $10,000 in cents and try again later if checkout is unavailable."
                      : (api?.prepaidWalletError(error) ??
                        "Wallet approval could not complete. Try again."),
            );
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    }

    async function checkBalance() {
        if (!result || inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError(undefined);
        try {
            const api = await import("../../lib/prepaid-checkout.ts");
            setBalance(
                await api.prepaidBalance(
                    `${config.genBaseUrl}/account/balance`,
                    result.key,
                ),
            );
        } catch {
            setError(
                "Couldn’t check your balance. Your key is still shown above; you can try again.",
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
                            Keep this key secret. Use gen.pollinations.ai as
                            your API base URL and send
                            <code> Authorization: Bearer YOUR_PREPAID_KEY</code>{" "}
                            with requests. Replace the placeholder with the key
                            above. Closing this page removes your copy; signing
                            in later will not recover it.
                        </p>
                        <Button
                            type="button"
                            disabled={busy}
                            onClick={() => void checkBalance()}
                        >
                            {busy
                                ? "Checking balance…"
                                : "Check remaining Pollen"}
                        </Button>
                        {balance !== null && (
                            <p role="status">Remaining Pollen: {balance}</p>
                        )}
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
                        <fieldset
                            disabled={busy || Boolean(pending)}
                            className="space-y-2"
                        >
                            <legend>Quick amounts</legend>
                            <div className="flex flex-wrap gap-2">
                                {POLLEN_PACKS.map((pack) => (
                                    <Button
                                        key={pack.packKey}
                                        type="button"
                                        aria-pressed={
                                            Number(amount) === pack.amountUsd
                                        }
                                        onClick={() => {
                                            setAmount(
                                                pack.amountUsd.toFixed(2),
                                            );
                                            setQuote(null);
                                            setError(undefined);
                                        }}
                                    >
                                        {pack.amountUsd} USDC
                                    </Button>
                                ))}
                            </div>
                        </fieldset>
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
                        {wallet && (
                            <p className="break-all text-sm" role="status">
                                Connected wallet: {wallet.address} · Base
                            </p>
                        )}
                        {quote && (
                            <p className="text-sm text-theme-text-muted">
                                Your wallet needs USDC on Base to pay. No funds
                                move until you approve the payment.
                            </p>
                        )}
                        <Button type="submit" intent="brand" disabled={busy}>
                            {busy
                                ? "Processing…"
                                : pending
                                  ? "Retry this payment"
                                  : quote
                                    ? wallet
                                        ? `Pay ${Number(amount).toFixed(2)} USDC`
                                        : "Connect wallet"
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
