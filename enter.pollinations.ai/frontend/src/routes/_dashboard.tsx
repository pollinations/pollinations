import { Button, Heading, InlineLink } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthModalLoading,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import { Await, createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { ApiKey } from "../components/keys";
import { DashboardShell } from "../components/layout/dashboard-shell.tsx";
import { SIGNED_OUT_NAV_ITEMS } from "../components/layout/dashboard-theme.ts";
import { SidebarWallet } from "../components/pollen";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";

const DASHBOARD_DATA_STALE_TIME = 30_000;
let dashboardSessionPromise: ReturnType<typeof authClient.getSession> | null =
    null;
let dashboardSessionExpiresAt = 0;

function getDashboardSession() {
    if (!dashboardSessionPromise || Date.now() >= dashboardSessionExpiresAt) {
        dashboardSessionExpiresAt = Date.now() + DASHBOARD_DATA_STALE_TIME;
        dashboardSessionPromise = authClient.getSession().catch((error) => {
            dashboardSessionPromise = null;
            throw error;
        });
    }
    return dashboardSessionPromise;
}

export const Route = createFileRoute("/_dashboard")({
    staleTime: DASHBOARD_DATA_STALE_TIME,
    beforeLoad: async () => {
        const result = await getDashboardSession();
        if (result.error) {
            dashboardSessionPromise = null;
            dashboardSessionExpiresAt = 0;
            throw new Error("Authentication failed.");
        }
        return { user: result.data?.user ?? null };
    },
    loader: async ({ context }) => {
        if (!context.user) {
            return {
                user: null,
                githubUsername: "",
                apiKeys: [] as ApiKey[],
                tierBalance: 0,
                packBalance: 0,
                communityEndpointsAllowed: false,
                discordAvailable: false,
                earnings: Promise.resolve(null),
            };
        }

        // Weekly earnings are optional display data, not a prerequisite for
        // opening any dashboard page. Keep slow analytics off the loader path.
        const earnings = apiClient.customer.balance.today
            .$get()
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        const [apiKeysResult, d1BalanceResult, profileResult] =
            await Promise.all([
                apiClient["api-keys"]
                    .$get()
                    .then((r) => (r.ok ? r.json() : { data: [] })),
                apiClient.customer.balance
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
                apiClient.account.profile
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
            ]);
        const sessionUser = context.user as typeof context.user & {
            githubUsername?: string | null;
        };

        return {
            user: context.user,
            githubUsername:
                profileResult?.githubUsername ??
                sessionUser.githubUsername ??
                "",
            apiKeys: (apiKeysResult.data || []) as ApiKey[],
            tierBalance: d1BalanceResult?.tierBalance ?? 0,
            packBalance: d1BalanceResult?.packBalance ?? 0,
            communityEndpointsAllowed:
                profileResult?.communityEndpointsAllowed ?? false,
            discordAvailable: profileResult?.discordAvailable ?? false,
            earnings,
        };
    },
    pendingComponent: () => (
        <AuthModalLoading
            title="Your account"
            message="Loading your account…"
        />
    ),
    errorComponent: () => (
        <AuthFlowLayout
            dialog={{ label: "Your account" }}
            actions={
                <Button onClick={() => window.location.reload()}>
                    Try again
                </Button>
            }
        >
            <Heading as="h1" size="section">
                Your account
            </Heading>
            <ErrorBanner>
                We couldn’t load your account. Please try again.
            </ErrorBanner>
        </AuthFlowLayout>
    ),
    component: DashboardLayout,
});

function DashboardLayout() {
    const data = Route.useLoaderData();
    const balances = {
        tierBalance: data.tierBalance,
        packBalance: data.packBalance,
    };
    const [isSigningOut, setIsSigningOut] = useState(false);

    async function handleSignOut(): Promise<void> {
        if (isSigningOut) return;
        setIsSigningOut(true);
        try {
            await authClient.signOut();
            window.location.href = "/news";
        } catch (error) {
            console.error("Sign out failed:", error);
            setIsSigningOut(false);
        }
    }

    return (
        <DashboardShell
            navItems={data.user ? undefined : SIGNED_OUT_NAV_ITEMS}
            githubUsername={data.githubUsername}
            githubAvatarUrl={data.user?.image || ""}
            onSignOut={data.user ? handleSignOut : undefined}
            accountArea={data.user ? undefined : <SignedOutAccountArea />}
            showFooterLinks={Boolean(data.user)}
            walletArea={
                data.user ? (
                    <Await
                        promise={data.earnings}
                        fallback={<SidebarWallet {...balances} />}
                    >
                        {(earnings) => (
                            <SidebarWallet {...balances} {...earnings} />
                        )}
                    </Await>
                ) : undefined
            }
        >
            <Outlet />
        </DashboardShell>
    );
}

export function SignedOutAccountArea({
    callbackURL,
}: {
    callbackURL?: string;
} = {}) {
    const { isSigningIn, error, signIn } = useGitHubSignIn(callbackURL);

    return (
        <div className="flex flex-col gap-2">
            <GitHubSignInButton
                onClick={() => void signIn()}
                isSigningIn={isSigningIn}
                className="w-full"
            />
            <p className="text-center text-xs text-theme-text-soft">
                New here? Continuing creates your Pollinations account.
            </p>
            <p className="px-1 text-center text-micro font-normal leading-[1.35] text-theme-text-muted">
                By continuing, you agree to the{" "}
                <InlineLink
                    href="https://pollinations.ai/terms"
                    showIcon={false}
                >
                    Terms of Service
                </InlineLink>{" "}
                and acknowledge the{" "}
                <InlineLink
                    href="https://pollinations.ai/privacy"
                    showIcon={false}
                >
                    Privacy Policy
                </InlineLink>
                .
            </p>
            {error && (
                <p
                    role="alert"
                    className="px-2 text-xs text-intent-danger-text"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
