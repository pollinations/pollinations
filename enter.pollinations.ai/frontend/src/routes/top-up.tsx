import { Button, RefreshIcon } from "@pollinations/ui";
import { AuthModalLoading } from "@pollinations/ui/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { BillingOverview as BillingState } from "../backend-types.ts";
import { AuthFlowScreen } from "../components/auth/auth-flow-screen.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { BuyPollenPanel } from "../components/pollen";
import { CheckoutConfirmation } from "../components/pollen/checkout-confirmation.tsx";
import {
    type AccountBalance,
    fetchAccountBalance,
} from "../hooks/use-account-balance.ts";
import { preferredReturnUrl, ReturnToApp } from "../lib/return-to-app.tsx";
import { validateTopUpSearch } from "../lib/top-up-search.ts";

/**
 * Standalone top-up: the wallet and top-up sections of the pollen page on
 * the auth-flow background, without the dashboard around them. Linked from
 * the low-balance notice gen returns inside chats, so the user can pay and
 * go back to the app.
 */
export const Route = createFileRoute("/top-up")({
    head: () => ({ meta: [{ title: "Top-up | pollinations.ai" }] }),
    validateSearch: validateTopUpSearch,
    component: TopUpPage,
});

function fetchBilling(): Promise<BillingState | null> {
    return apiClient.stripe.billing
        .$get()
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
}

function TopUpPage() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/top-up" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const [wallet, setWallet] = useState<AccountBalance | null>(null);
    const [walletError, setWalletError] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [billing, setBilling] = useState<BillingState | null | undefined>(
        undefined,
    );
    const returnUrl = search.redirect ?? null;

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

        fetchAccountBalance()
            .then((data) => {
                if (!canceled) setWallet(data);
            })
            .catch(() => {
                if (!canceled) setWalletError(true);
            });
        fetchBilling().then((data) => {
            if (!canceled) setBilling(data);
        });
        return () => {
            canceled = true;
        };
    }, [user, loadAttempt]);

    // After a credit: update in place, so the open checkout stays mounted.
    function refreshWallet(): void {
        fetchAccountBalance()
            .then(setWallet)
            .catch(() => {});
        fetchBilling().then((data) => {
            if (data) setBilling(data);
        });
    }

    if (isPending) return <AuthModalLoading title="Top-up" />;

    if (!user) {
        return (
            <SignInScreen
                title="Top-up"
                description="Sign in to your Pollinations account to continue."
            />
        );
    }

    if (search.stripe_success) {
        return (
            <AuthFlowScreen
                footnote="back"
                title="Top-up"
                description={
                    search.session_id
                        ? undefined
                        : "Your Pollen will appear when Stripe confirms the payment."
                }
                balance={wallet}
                topUpHref={null}
                actions={
                    returnUrl ? (
                        <ReturnToApp returnUrl={returnUrl} />
                    ) : undefined
                }
            >
                {search.session_id && (
                    <CheckoutConfirmation
                        sessionId={search.session_id}
                        onCredited={refreshWallet}
                        onRetry={() =>
                            void navigate({
                                search: (prev) => ({
                                    pack: prev.pack,
                                    redirect: prev.redirect,
                                }),
                            })
                        }
                    />
                )}
            </AuthFlowScreen>
        );
    }

    if (walletError) {
        return (
            <AuthFlowScreen
                footnote="help"
                title="Top-up"
                error="Couldn’t load your wallet."
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
            />
        );
    }

    if (!wallet) return <AuthModalLoading title="Top-up" />;

    return (
        <AuthFlowScreen
            footnote="payment"
            title="Top-up"
            error={
                search.stripe_canceled
                    ? "Checkout was cancelled. Choose an amount to try again."
                    : undefined
            }
            size="lg"
            balance={wallet}
            topUpHref={null}
            actions={
                returnUrl ? <ReturnToApp returnUrl={returnUrl} /> : undefined
            }
        >
            {billing === undefined ? null : (
                <BuyPollenPanel
                    initialBilling={billing}
                    returnToTopUp={{ redirect: search.redirect }}
                    onWalletChange={refreshWallet}
                    initialPack={search.pack}
                />
            )}
        </AuthFlowScreen>
    );
}
