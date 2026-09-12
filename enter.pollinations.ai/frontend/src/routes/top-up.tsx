import { Button, InlineLink } from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModal,
    AuthModalHeader,
    AuthModalLoading,
    ErrorBanner,
} from "@pollinations/ui/auth";
import { formatPollen } from "@pollinations/ui/wallet";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
    POLLEN_PACKS,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import { PollenPackPurchase } from "../components/pollen";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import {
    parseAppUrl,
    ReturnToApp,
    resolveReturnUrl,
} from "../lib/return-to-app.tsx";

type TopUpSearch = {
    pack?: PollenPackKey;
    redirect?: string;
    stripe_success?: boolean;
    stripe_canceled?: boolean;
};

/**
 * Standalone top-up: the pack slider and nothing else, shown on the auth-flow
 * background. Linked from the low-balance notice gen returns inside chats,
 * so the user can pay and go back to the app without touring the dashboard.
 */
export const Route = createFileRoute("/top-up")({
    validateSearch: (search: Record<string, unknown>): TopUpSearch => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        redirect: parseAppUrl(search.redirect) ?? undefined,
        stripe_success: search.stripe_success === "true" || undefined,
        stripe_canceled: search.stripe_canceled === "true" || undefined,
    }),
    component: TopUpPage,
});

function TopUpPage() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/top-up" });
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const [balance, setBalance] = useState<number | null>(null);
    const returnUrl = resolveReturnUrl(search.redirect ?? null);
    const selectedPack =
        getPollenPackByKey(search.pack ?? "p5") ?? POLLEN_PACKS[0];

    useEffect(() => {
        if (!user) return;
        apiClient.customer.balance
            .$get()
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!data) return;
                setBalance((data.tierBalance ?? 0) + (data.packBalance ?? 0));
            })
            .catch(() => {});
    }, [user]);

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

    if (search.stripe_success) {
        return (
            <AuthModal dialog={{ label: "Pollen added" }}>
                <AuthModalHeader />
                <div className="px-6 pb-6 pt-4 space-y-4">
                    <AuthInfoCard title="Pollen added">
                        <p className="text-sm text-theme-text-base">
                            Your payment went through.
                            {balance != null && (
                                <>
                                    {" "}
                                    Wallet balance:{" "}
                                    <span className="font-semibold text-theme-text-strong">
                                        {formatPollen(balance)} pollen
                                    </span>
                                    .
                                </>
                            )}
                        </p>
                    </AuthInfoCard>
                    <ReturnToApp returnUrl={returnUrl} />
                </div>
            </AuthModal>
        );
    }

    // Stripe comes back here; the server re-adds the pack it was sent.
    const returnPath = `/top-up${search.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : ""}`;

    return (
        <AuthModal dialog={{ label: "Top up" }}>
            <AuthModalHeader />
            <div className="px-6 pb-6 pt-4 space-y-4">
                {search.stripe_canceled && (
                    <ErrorBanner>Checkout was cancelled.</ErrorBanner>
                )}
                <AuthInfoCard title="Top up">
                    <p className="text-sm text-theme-text-base">
                        {balance != null ? (
                            <>
                                Your wallet holds{" "}
                                <span className="font-semibold text-theme-text-strong">
                                    {formatPollen(balance)} pollen
                                </span>
                                . Pick a pack to add more.
                            </>
                        ) : (
                            "Pick a pack to add Pollen to your wallet."
                        )}
                    </p>
                </AuthInfoCard>
                <PollenPackPurchase
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
                <p className="text-sm text-theme-text-muted">
                    Prefer not to pay?{" "}
                    <InlineLink href="/quests">Complete a quest</InlineLink> to
                    earn Pollen instead.
                </p>
            </div>
        </AuthModal>
    );
}
