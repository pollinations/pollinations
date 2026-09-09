import { useAccountBalance, useAuthState } from "@pollinations/sdk/react";
import { Button, Dialog } from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { useCallback, useEffect, useState } from "react";
import { ENTER_URL, SANDBOX_TOP_UP } from "../../config";
import { planKeyTopUp, TOP_UP_AMOUNTS } from "./top-up-key-demo";

type Receipt = {
    completed: boolean;
    purchased: number | null;
    balance: number;
    allowance: number;
};

export default function TopUpKeyDemo({ onClose }: { onClose: () => void }) {
    const { apiKey } = useAuthState();
    const account = useAccountBalance({ enabled: SANDBOX_TOP_UP });
    const [amount, setAmount] = useState<number>(20);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const params = new URLSearchParams(window.location.search);
    const topUpId = params.get("app_top_up");
    const canceled = params.get("stripe_canceled") === "true";
    const balance = account.data?.accountBalance?.total;
    const allowance = account.data?.balance;
    const plan =
        balance !== undefined && allowance !== undefined
            ? planKeyTopUp(balance, allowance, amount)
            : null;

    const loadReceipt = useCallback(async () => {
        if (!apiKey || !topUpId || !SANDBOX_TOP_UP) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(
                `${ENTER_URL}/api/app-purchases/status/${encodeURIComponent(topUpId)}`,
                {
                    headers: { Authorization: `Bearer ${apiKey}` },
                },
            );
            const result = await response.json();
            if (!response.ok)
                throw new Error(
                    result.message || "Could not check the top-up.",
                );
            setReceipt(result);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not check the top-up.",
            );
        } finally {
            setBusy(false);
        }
    }, [apiKey, topUpId]);

    useEffect(() => {
        void loadReceipt();
    }, [loadReceipt]);

    function close() {
        if (!topUpId) {
            onClose();
            return;
        }
        const url = new URL(window.location.href);
        for (const key of [
            "app_top_up",
            "session_id",
            "stripe_success",
            "stripe_canceled",
            "pack",
        ])
            url.searchParams.delete(key);
        window.location.replace(url.toString());
    }

    async function topUp() {
        if (!apiKey || !SANDBOX_TOP_UP || busy) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`${ENTER_URL}/api/app-purchases`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount,
                    returnTo: `${window.location.origin}/play`,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.url)
                throw new Error(result.message || "Could not start top-up.");
            const url = new URL(result.url);
            if (url.origin !== ENTER_URL || url.pathname !== "/buy")
                throw new Error("Invalid top-up destination.");
            window.location.assign(url.toString());
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not start top-up.",
            );
            setBusy(false);
        }
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) close();
            }}
            size="sm"
            title="Add Pollen"
            contentClassName="polli:max-h-[calc(100dvh-2rem)] polli:overflow-y-auto"
        >
            <div className="space-y-5 p-6 text-theme-text-strong">
                <p className="text-xs text-theme-text-muted">
                    Sandbox · Test balances and payments only
                </p>
                {!SANDBOX_TOP_UP ? (
                    <p>
                        Sandbox registration is not configured. Your real
                        account will not be changed.
                    </p>
                ) : topUpId ? (
                    <>
                        {receipt?.completed ? (
                            <output className="block space-y-2">
                                <p>
                                    Pollen ready to use. App budget:{" "}
                                    {formatPollen(receipt.allowance)} Pollen.
                                </p>
                                <p>
                                    Account balance:{" "}
                                    {formatPollen(receipt.balance)} Pollen.
                                </p>
                                <p className="text-sm">
                                    {receipt.purchased
                                        ? `${receipt.purchased} Pollen purchased.`
                                        : "No purchase needed."}
                                </p>
                            </output>
                        ) : (
                            <>
                                <p>
                                    {canceled
                                        ? "Checkout canceled. No payment confirmed."
                                        : "Waiting for confirmed top-up. Your allowance will update after payment is processed."}
                                </p>
                                <Button
                                    disabled={busy}
                                    className="min-h-12 w-full"
                                    onClick={loadReceipt}
                                >
                                    {busy ? "Checking…" : "Check top-up"}
                                </Button>
                            </>
                        )}
                        <Button className="min-h-12 w-full" onClick={close}>
                            Back to Play
                        </Button>
                    </>
                ) : (
                    <>
                        <dl className="flex justify-between gap-4 text-sm">
                            <div>
                                <dt>Account balance</dt>
                                <dd>
                                    {balance === undefined
                                        ? "—"
                                        : `${formatPollen(balance)} Pollen`}
                                </dd>
                            </div>
                            <div>
                                <dt>App budget</dt>
                                <dd>
                                    {allowance === undefined
                                        ? "—"
                                        : `${formatPollen(allowance)} Pollen`}
                                </dd>
                            </div>
                        </dl>
                        <fieldset>
                            <legend className="mb-2 text-sm">
                                Add to this app
                            </legend>
                            <div className="grid grid-cols-4 gap-2">
                                {TOP_UP_AMOUNTS.map((value) => (
                                    <Button
                                        key={value}
                                        aria-pressed={amount === value}
                                        appearance="raised"
                                        intent={
                                            amount === value
                                                ? undefined
                                                : "neutral"
                                        }
                                        className="min-h-12"
                                        onClick={() => setAmount(value)}
                                    >
                                        {value}
                                    </Button>
                                ))}
                            </div>
                        </fieldset>
                        <p className="text-sm">
                            {!plan
                                ? "Your balance will be checked securely on Enter."
                                : plan.shortfall === 0
                                  ? "Your balance is sufficient. No purchase needed."
                                  : `Your account needs ${formatPollen(plan.shortfall)} more Pollen. You'll review the Stripe purchase before paying.`}
                        </p>
                        <Button
                            disabled={busy || !apiKey}
                            className="min-h-12 w-full"
                            onClick={topUp}
                        >
                            {busy ? "Continuing…" : "Add Pollen"}
                        </Button>
                    </>
                )}
                {error && <p role="alert">{error}</p>}
                {account.error && !topUpId && (
                    <p className="text-sm">
                        Balance unavailable here. Enter will verify it before
                        any change.
                    </p>
                )}
                {!topUpId && (
                    <Button
                        intent="neutral"
                        className="min-h-11 w-full"
                        onClick={close}
                    >
                        Cancel
                    </Button>
                )}
            </div>
        </Dialog>
    );
}
