import { AccountIdentity, Button, Section } from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    POLLEN_PACKS,
} from "@shared/pollen-packs.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import type { BillingState } from "../components/pollen/auto-top-up-panel.tsx";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import { preferredReturnUrl, ReturnToApp } from "../lib/return-to-app.tsx";

import { validateTopUpSearch } from "../lib/top-up-search.ts";

type WalletState = {
    tierBalance: number;
    packBalance: number;
    paidWeek?: number;
    tierWeek?: number;
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
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
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
                // Earnings are optional; their failure must not hide the wallet.
                void apiClient.customer.balance.today
                    .$get()
                    .then((r) => (r.ok ? r.json() : null))
                    .then((earnings) => {
                        if (!canceled && earnings) {
                            setWallet((w) => (w ? { ...w, ...earnings } : w));
                        }
                    })
                    .catch(() => {});
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

    if (isPending) return <AuthModalLoading />;

    if (!user) {
        return (
            <AuthModal
                dialog={{ label: "Sign in to top up" }}
                tone={signInError ? "error" : undefined}
            >
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    {signInError ? (
                        <ErrorBanner>{signInError}</ErrorBanner>
                    ) : (
                        <AuthInfoCard title="Top up">
                            <p className="text-sm text-theme-text-base">
                                Sign in to add Pollen to your wallet.
                            </p>
                        </AuthInfoCard>
                    )}
                    <div className="flex justify-end">
                        <Button
                            as="button"
                            onClick={signIn}
                            disabled={isSigningIn}
                        >
                            {isSigningIn
                                ? "Signing in..."
                                : "Continue with GitHub"}
                        </Button>
                    </div>
                </div>
            </AuthModal>
        );
    }

    const accountIdentity = (
        <AccountIdentity
            name={user.githubUsername || user.name}
            avatarUrl={user.image}
        />
    );

    if (search.stripe_success) {
        return (
            <AuthModal dialog={{ label: "Pollen added" }}>
                <AuthModalHeader>{accountIdentity}</AuthModalHeader>
                <div className="px-6 pb-6 pt-4 space-y-4">
                    <AuthInfoCard title="Pollen added">
                        <p className="text-sm text-theme-text-base">
                            Your payment went through.
                        </p>
                    </AuthInfoCard>
                    {wallet && <PollenBalance {...wallet} compact />}
                    <ReturnToApp returnUrl={returnUrl} autoReturn />
                </div>
            </AuthModal>
        );
    }

    if (walletError) {
        return (
            <AuthModal dialog={{ label: "Top up" }} tone="error">
                <AuthModalHeader>{accountIdentity}</AuthModalHeader>
                <div className="px-6 pb-6 pt-4 space-y-4">
                    <ErrorBanner>
                        Could not load your wallet. Please try again.
                    </ErrorBanner>
                    <Button
                        as="button"
                        onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                    >
                        Try again
                    </Button>
                </div>
            </AuthModal>
        );
    }

    if (!wallet || billing === undefined) return <AuthModalLoading />;

    // Stripe comes back here; the server re-adds the pack it was sent.
    const returnPath = `/top-up${search.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : ""}`;

    return (
        <AuthModal dialog={{ label: "Top up" }} contentClassName="max-w-2xl">
            <AuthModalHeader>{accountIdentity}</AuthModalHeader>
            <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
                {search.stripe_canceled && (
                    <ErrorBanner>Checkout was cancelled.</ErrorBanner>
                )}
                <Section title="Wallet">
                    <PollenBalance {...wallet} compact />
                </Section>
                <Section title="Top-up" framed>
                    <BuyPollenPanel
                        initialBillingState={billing}
                        selectedPackAmount={selectedPack?.amountUsd ?? 5}
                        onSelectedPackAmountChange={(amount) => {
                            const pack = getPollenPackByAmount(amount);
                            if (pack) {
                                void navigate({
                                    search: (prev) => ({
                                        ...prev,
                                        pack: pack.packKey,
                                    }),
                                });
                            }
                        }}
                        checkoutReturnPath={returnPath}
                    />
                </Section>
                <ReturnToApp returnUrl={returnUrl} />
            </div>
        </AuthModal>
    );
}
