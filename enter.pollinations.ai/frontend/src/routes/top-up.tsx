import { Button, RefreshIcon } from "@pollinations/ui";
import { AuthModalLoading, ErrorBanner } from "@pollinations/ui/auth";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { BuyPollenPanel } from "../components/pollen";
import type { BillingState } from "../components/pollen/auto-top-up-panel.tsx";
import { preferredReturnUrl, ReturnToApp } from "../lib/return-to-app.tsx";

import { validateTopUpSearch } from "../lib/top-up-search.ts";

type WalletState = {
    tierBalance: number;
    packBalance: number;
};

/**
 * Standalone top-up: the wallet and top-up sections of the pollen page on
 * the auth-flow background, without the dashboard around them. Linked from
 * the low-balance notice gen returns inside chats, so the user can pay and
 * go back to the app.
 */
export const Route = createFileRoute("/top-up")({
    validateSearch: validateTopUpSearch,
    component: TopUpPage,
});

function TopUpPage() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/top-up" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const [wallet, setWallet] = useState<WalletState | null>(null);
    const [walletError, setWalletError] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [billing, setBilling] = useState<BillingState | null | undefined>(
        undefined,
    );
    const returnUrl = search.redirect ?? null;
    const selectedPack =
        getPollenPackByKey(search.pack ?? "p5") ?? POLLEN_PACKS[0];

    // Remember which app sent us before Stripe overwrites the referrer.
    useEffect(() => {
        if (
            search.stripe_success ||
            search.stripe_canceled ||
            search.stripe_billing_return
        )
            return;
        const from = preferredReturnUrl(search.redirect);
        if (from) {
            void navigate({
                search: (prev) => ({ ...prev, redirect: from }),
                replace: true,
            });
        }
    }, [
        navigate,
        search.redirect,
        search.stripe_success,
        search.stripe_canceled,
        search.stripe_billing_return,
    ]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt retries the requests when the user selects Try again.
    useEffect(() => {
        if (!user) return;
        let canceled = false;
        setWallet(null);
        setWalletError(false);
        setBilling(undefined);

        apiClient.customer.balance
            .$get()
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load wallet");
                return r.json();
            })
            .then((data) => {
                if (canceled) return;
                setWallet({
                    tierBalance: data.tierBalance ?? 0,
                    packBalance: data.packBalance ?? 0,
                });
            })
            .catch(() => {
                if (!canceled) setWalletError(true);
            });
        apiClient.stripe.billing
            .$get()
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((data) => {
                if (!canceled) setBilling(data);
            });
        return () => {
            canceled = true;
        };
    }, [user, loadAttempt]);

    if (isPending) return <AuthModalLoading title="Add Pollen" />;

    if (!user) {
        return (
            <SignInScreen
                title="Add Pollen"
                description="Sign in to add Pollen to your account."
            />
        );
    }

    if (search.stripe_success) {
        return (
            <AuthFlowScreen
                footnote="back"
                title="Pollen added"
                description="Your wallet updates as soon as Stripe confirms the payment. You can return to the app or close this tab."
                balance={wallet}
                topUpHref={null}
                actions={
                    returnUrl ? (
                        <ReturnToApp returnUrl={returnUrl} />
                    ) : undefined
                }
            />
        );
    }

    if (walletError) {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Couldn’t load your wallet"
                balance={wallet}
                topUpHref={null}
                actions={
                    <Button
                        icon={<RefreshIcon />}
                        onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                    >
                        Try again
                    </Button>
                }
            >
                <ErrorBanner>Please try again.</ErrorBanner>
            </AuthFlowScreen>
        );
    }

    if (!wallet || billing === undefined)
        return <AuthModalLoading title="Add Pollen" />;

    return (
        <AuthFlowScreen
            title="Add Pollen"
            description={
                search.stripe_canceled
                    ? "Checkout was cancelled. Choose an amount to try again."
                    : "Choose an amount. Paid Pollen never expires."
            }
            size="lg"
            balance={wallet}
            topUpHref={null}
            actions={
                returnUrl ? <ReturnToApp returnUrl={returnUrl} /> : undefined
            }
        >
            <BuyPollenPanel
                initialBillingState={billing}
                selectedPackAmount={selectedPack?.amountUsd ?? 5}
                onSelectedPackAmountChange={(amount) => {
                    const pack = getPollenPackByAmount(amount);
                    if (pack) {
                        void navigate({
                            search: (prev) => ({ ...prev, pack: pack.packKey }),
                        });
                    }
                }}
                returnToTopUp={{ redirect: search.redirect }}
            />
        </AuthFlowScreen>
    );
}
