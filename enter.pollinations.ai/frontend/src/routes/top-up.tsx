import { Button, Heading, Section } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthModalLoading,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import {
    getPollenPackByAmount,
    getPollenPackByKey,
    isPollenPackKey,
} from "@shared/pollen-packs.ts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { AuthAccountIdentity } from "../components/auth/auth-account-identity.tsx";
import { SignInScreen } from "../components/auth/sign-in-screen.tsx";
import { BuyPollenPanel, PollenBalance } from "../components/pollen";
import type { BillingState } from "../components/pollen/auto-top-up-panel.tsx";
import { WalletPaymentStatus } from "../components/pollen/wallet-payment-status.tsx";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";
import {
    AccountReturn,
    parseAccountReturn,
} from "../lib/account-action-return.tsx";
import { loadWallet } from "../lib/load-wallet.ts";

export const Route = createFileRoute("/top-up")({
    validateSearch: (search: Record<string, unknown>) => ({
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : ("p5" as const),
        redirect: parseAccountReturn(search.redirect),
        session_id:
            typeof search.session_id === "string"
                ? search.session_id
                : undefined,
        stripe_canceled:
            search.stripe_canceled === true ||
            search.stripe_canceled === "true" ||
            undefined,
    }),
    component: WalletPage,
});

type WalletData = {
    tierBalance: number;
    packBalance: number;
    billing: BillingState | null;
    payment?: "pending" | "credited";
};
function WalletPage() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: "/top-up" });
    const { data: session, isPending } = authClient.useSession();
    const { isSigningIn, error: signInError, signIn } = useGitHubSignIn();
    const [attempt, setAttempt] = useState(0);
    const [data, setData] = useState<WalletData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const userId = session?.user.id;
    // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the failed request.
    useEffect(() => {
        if (!userId) return;
        let active = true;
        setData(null);
        setError(null);
        loadWallet(search.session_id)
            .then((wallet) => {
                if (active) setData(wallet);
            })
            .catch((error) => {
                if (active)
                    setError(
                        error instanceof Error
                            ? error.message
                            : "Couldn’t load your wallet. Try again.",
                    );
            });
        return () => {
            active = false;
        };
    }, [userId, search.session_id, attempt]);
    const back = search.redirect ? (
        <AccountReturn href={search.redirect} />
    ) : undefined;
    if (isPending) return <AuthModalLoading title="Loading wallet" />;
    if (!userId)
        return (
            <SignInScreen
                title="Sign in to open your wallet"
                error={signInError}
                actions={
                    <GitHubSignInButton
                        onClick={signIn}
                        isSigningIn={isSigningIn}
                        retry={!!signInError}
                    />
                }
                secondaryAction={back}
            />
        );
    if (!data && !error) return <AuthModalLoading title="Loading wallet" />;
    const returnPath = `/top-up${search.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : ""}`;
    return (
        <AuthFlowLayout
            account={
                <AuthAccountIdentity
                    user={session.user}
                    balances={
                        data
                            ? {
                                  paid: data.packBalance,
                                  quest: data.tierBalance,
                              }
                            : null
                    }
                />
            }
            actions={
                error || data?.payment === "pending" ? (
                    <Button onClick={() => setAttempt((n) => n + 1)}>
                        {error ? "Try again" : "Check payment"}
                    </Button>
                ) : null
            }
            secondaryAction={back}
        >
            <div className="space-y-2 pt-3">
                <Heading as="h1" size="section">
                    Wallet
                </Heading>
                <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                    Add Pollen to your account.
                </p>
            </div>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <WalletPaymentStatus
                payment={data?.payment}
                canceled={search.stripe_canceled}
            />
            {data && (
                <>
                    <PollenBalance
                        tierBalance={data.tierBalance}
                        packBalance={data.packBalance}
                        compact
                    />
                    {data.payment !== "pending" && (
                        <Section title="Top up" framed>
                            <BuyPollenPanel
                                initialBillingState={data.billing}
                                selectedPackAmount={
                                    getPollenPackByKey(search.pack)
                                        ?.amountUsd ?? 5
                                }
                                onSelectedPackAmountChange={(amount) => {
                                    const pack = getPollenPackByAmount(amount);
                                    if (pack)
                                        void navigate({
                                            search: (old) => ({
                                                ...old,
                                                pack: pack.packKey,
                                            }),
                                        });
                                }}
                                checkoutReturnPath={returnPath}
                            />
                        </Section>
                    )}
                    <p className="text-sm text-theme-text-muted">
                        Adding funds doesn’t change an app’s spending limit. You
                        can close this tab when finished.
                    </p>
                </>
            )}
        </AuthFlowLayout>
    );
}
