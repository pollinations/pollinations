import { Button, GitHubIcon, InlineLink } from "@pollinations/ui";
import {
    Await,
    createFileRoute,
    Outlet,
    useRouter,
} from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient } from "../auth.ts";
import type { ApiKey } from "../components/keys";
import {
    LoadError,
    SectionContent,
} from "../components/layout/dashboard-loading.tsx";
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
    loader: ({ context }) => {
        const user = context.user;
        const apiKeys = user
            ? apiClient["api-keys"]
                  .$get()
                  .then(async (r) =>
                      r.ok ? ((await r.json()).data as ApiKey[]) : null,
                  )
                  .catch(() => null)
            : Promise.resolve([] as ApiKey[]);
        const balance = user
            ? apiClient.customer.balance
                  .$get()
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
            : Promise.resolve(null);
        const profile = user
            ? apiClient.account.profile
                  .$get()
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
            : Promise.resolve(null);
        const earnings = user
            ? apiClient.customer.balance.today
                  .$get()
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
            : Promise.resolve(null);
        const sessionUser = user as typeof user & {
            githubUsername?: string | null;
        };
        return {
            user,
            githubUsername: sessionUser?.githubUsername ?? "",
            apiKeys,
            balance,
            profile,
            earnings,
        };
    },
    component: DashboardLayout,
});

export function useDashboardRetry(resource: "balance" | "profile") {
    const router = useRouter();
    return async () => {
        await router.invalidate({
            filter: (match) => match.routeId === Route.id,
            sync: true,
        });
        await router.state.matches.find((match) => match.routeId === Route.id)
            ?.loaderData?.[resource];
    };
}

function DashboardLayout() {
    const retry = useDashboardRetry("balance");
    const data = useDeferredValue(Route.useLoaderData());
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
            accountName={data.user?.name || data.githubUsername}
            githubAvatarUrl={data.user?.image || ""}
            onSignOut={data.user ? handleSignOut : undefined}
            accountArea={data.user ? undefined : <SignedOutAccountArea />}
            showFooterLinks={Boolean(data.user)}
            walletArea={
                data.user ? (
                    <Await
                        promise={data.balance}
                        fallback={
                            <SectionContent loading label="Loading balance…" />
                        }
                    >
                        {(balance) =>
                            balance ? (
                                <Await
                                    promise={data.earnings}
                                    fallback={<SidebarWallet {...balance} />}
                                >
                                    {(earnings) => (
                                        <SidebarWallet
                                            {...balance}
                                            {...earnings}
                                        />
                                    )}
                                </Await>
                            ) : (
                                <LoadError onRetry={retry}>
                                    Couldn’t load your balance.
                                </LoadError>
                            )
                        }
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
                <p className="px-2 text-xs text-intent-danger-text">{error}</p>
            )}
        </div>
    );
}
