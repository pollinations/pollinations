import { Button, Surface } from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../auth.ts";

export const Route = createFileRoute("/buy")({ component: BuyPage });

type TopUp = {
    id: string;
    appName: string;
    amount: number;
    balance: number;
    allowance: number;
    completedAt: number | null;
    checkoutPack: number | null;
    returnTo: string;
};

function returnToApp(purchase: TopUp) {
    const url = new URL(purchase.returnTo);
    url.searchParams.set("app_top_up", purchase.id);
    window.location.replace(url.toString());
}

async function readResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json()) as T & {
        message?: string;
        error?: string;
    };
    if (!response.ok)
        throw new Error(
            payload.message ||
                payload.error ||
                "Could not complete this top-up.",
        );
    return payload as T;
}

function BuyPage() {
    const started = useRef(false);
    const [purchase, setPurchase] = useState<TopUp | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        async function load() {
            const params = new URLSearchParams(window.location.search);
            const id = params.get("purchase");
            if (!id || !/^[a-f0-9-]{36}$/.test(id))
                throw new Error("Invalid top-up link.");
            const session = await authClient.getSession();
            if (session.error) throw new Error("Could not check your account.");
            if (!session.data?.user) {
                if (params.has("authenticated"))
                    throw new Error("Sign-in did not complete.");
                const callback = new URL(window.location.href);
                callback.searchParams.set("authenticated", "1");
                const result = await authClient.signIn.social({
                    provider: "github",
                    callbackURL: callback.toString(),
                    newUserCallbackURL: callback.toString(),
                });
                if (result.error) throw new Error("Could not start sign-in.");
                return;
            }
            const result = await readResponse<TopUp>(
                await fetch(`/api/app-purchases/intent/${id}`),
            );
            if (result.completedAt) returnToApp(result);
            else setPurchase(result);
        }
        void load().catch((error) =>
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not load top-up.",
            ),
        );
    }, []);

    async function confirm() {
        if (!purchase || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await readResponse<TopUp>(
                await fetch(`/api/app-purchases/intent/${purchase.id}`, {
                    method: "POST",
                }),
            );
            if (result.completedAt) returnToApp(result);
            else {
                const checkout = await readResponse<{ url: string }>(
                    await fetch(
                        `/api/stripe/checkout/p${result.checkoutPack}?purchase=${purchase.id}`,
                    ),
                );
                window.location.replace(checkout.url);
            }
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not complete top-up.",
            );
            setBusy(false);
        }
    }

    return (
        <main className="mx-auto flex min-h-svh max-w-md items-center p-5">
            <Surface className="w-full space-y-4">
                <h1 className="text-xl font-semibold">Add Pollen</h1>
                <p className="text-xs text-theme-text-muted">
                    Sandbox · Test balances and payments only
                </p>
                {purchase && (
                    <>
                        <p>
                            Allow <strong>{purchase.appName}</strong> to spend{" "}
                            {purchase.amount} more Pollen from your account.
                        </p>
                        <p className="text-sm">
                            Account balance: {formatPollen(purchase.balance)}{" "}
                            Pollen. Current app budget:{" "}
                            {formatPollen(purchase.allowance)} Pollen.
                        </p>
                        <p className="text-sm">
                            {purchase.checkoutPack ||
                            purchase.balance <
                                purchase.allowance + purchase.amount
                                ? "Your balance is insufficient. Continue to Stripe to review the purchase, fees and tax before paying."
                                : "Your balance is sufficient. No purchase is needed."}
                        </p>
                        <Button
                            disabled={busy}
                            className="min-h-12 w-full"
                            onClick={confirm}
                        >
                            {busy ? "Continuing…" : "Confirm top-up"}
                        </Button>
                        <Button
                            disabled={busy}
                            intent="neutral"
                            className="min-h-11 w-full"
                            onClick={() =>
                                window.location.replace(purchase.returnTo)
                            }
                        >
                            Cancel
                        </Button>
                    </>
                )}
                {!purchase && !error && <p>Checking your account…</p>}
                {error && <p role="alert">{error}</p>}
            </Surface>
        </main>
    );
}
