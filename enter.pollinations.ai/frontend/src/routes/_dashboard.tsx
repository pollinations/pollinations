import { Button, GitHubIcon } from "@pollinations/ui";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { ApiKey } from "../components/keys";
import { DashboardShell } from "../components/layout/dashboard-shell.tsx";
import { SIGNED_OUT_NAV_ITEMS } from "../components/layout/dashboard-theme.ts";
import { SidebarWallet } from "../components/pollen";
import { useGitHubSignIn } from "../hooks/use-github-sign-in.ts";

export const Route = createFileRoute("/_dashboard")({
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.error) throw new Error("Authentication failed.");
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
                billingState: null,
                paidWeek: 0,
                tierWeek: 0,
            };
        }

        const [
            apiKeysResult,
            d1BalanceResult,
            profileResult,
            billingState,
            earningsTodayResult,
        ] = await Promise.all([
            apiClient["api-keys"]
                .$get()
                .then((r) => (r.ok ? r.json() : { data: [] })),
            apiClient.customer.balance
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.account.profile
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.stripe.billing
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            apiClient.customer.balance.today
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
            billingState,
            paidWeek: earningsTodayResult?.paidWeek ?? 0,
            tierWeek: earningsTodayResult?.tierWeek ?? 0,
        };
    },
    component: DashboardLayout,
});

function DashboardLayout() {
    const data = Route.useLoaderData();
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
            showContextualNav={Boolean(data.user)}
            githubUsername={data.githubUsername}
            githubAvatarUrl={data.user?.image || ""}
            onSignOut={data.user ? handleSignOut : undefined}
            accountArea={data.user ? undefined : <SignedOutAccountArea />}
            walletArea={
                data.user ? (
                    <SidebarWallet
                        tierBalance={data.tierBalance}
                        packBalance={data.packBalance}
                        paidWeek={data.paidWeek}
                        tierWeek={data.tierWeek}
                    />
                ) : undefined
            }
        >
            <Outlet />
        </DashboardShell>
    );
}

export function SignedOutAccountArea() {
    const { isSigningIn, error, signIn } = useGitHubSignIn();

    return (
        <div className="flex flex-col gap-2">
            <Button
                as="button"
                data-theme="accent"
                onClick={() => void signIn()}
                disabled={isSigningIn}
                className="w-full justify-center gap-2 text-center"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                {isSigningIn ? "Signing in..." : "Sign in with GitHub"}
            </Button>
            {error && (
                <p className="px-2 text-xs text-intent-danger-text">{error}</p>
            )}
        </div>
    );
}
