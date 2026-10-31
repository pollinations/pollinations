import {
    Button,
    GitHubIcon,
    GoogleIcon,
    InlineLink,
    OutageNotice,
    Section,
} from "@pollinations/ui";
import {
    Await,
    createFileRoute,
    Outlet,
    useRouter,
    useRouterState,
} from "@tanstack/react-router";
import { Suspense, useDeferredValue } from "react";
import { accountClient, forgetSessionToken } from "../api.ts";
import { authClient, type User } from "../auth.ts";
import type { ListedApp } from "../backend-types.ts";
import type { DeveloperEarningsRow } from "../components/activity/use-earnings-data.ts";
import { DashboardSignInBanner } from "../components/auth/dashboard-sign-in-banner.tsx";
import type { ApiKey } from "../components/keys";
import {
    LoadError,
    PageStatus,
} from "../components/layout/dashboard-loading.tsx";
import { DASHBOARD_AUTH_FAILED_MESSAGE } from "../components/layout/dashboard-session-failure.ts";
import { DashboardShell } from "../components/layout/dashboard-shell.tsx";
import {
    DASHBOARD_NAV_ITEMS,
    SIGNED_OUT_NAV_ITEMS,
} from "../components/layout/dashboard-theme.ts";
import { SidebarOutage, SidebarWallet } from "../components/pollen";
import {
    BALANCE_PATH,
    fetchAccountBalance,
} from "../hooks/use-account-balance.ts";
import { useSocialSignIn } from "../hooks/use-social-sign-in.ts";
import { isOutageStatus, useOutage, useOutageRetry } from "../lib/outage.ts";
import { PAGE_TITLES } from "../page-meta.ts";

const DASHBOARD_DATA_STALE_TIME = 30_000;
// Pages that load without an account (Sandboxes, under Explore, needs one).
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
    "/news",
    "/models",
    "/agents",
    "/quests",
    "/sign-in",
]);
let dashboardSessionPromise: ReturnType<typeof authClient.getSession> | null =
    null;
let dashboardSessionExpiresAt = 0;
// `sessionUnavailable`: Pollinations is down, so who is signed in is unknown.
type DashboardSession = { user: User | null; sessionUnavailable?: boolean };
// The last session the server confirmed. A refresh that fails to complete is
// not a sign-out (an expired session resolves with no user), so reuse this
// instead of replacing the dashboard, and an open new-key secret, with an
// error page.
let lastDashboardSession: DashboardSession | null = null;

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
    beforeLoad: async (): Promise<DashboardSession> => {
        const result = await getDashboardSession().catch(() => null);
        if (!result || result.error) {
            dashboardSessionPromise = null;
            dashboardSessionExpiresAt = 0;
            if (lastDashboardSession) return lastDashboardSession;
            // No response or a 5xx: keep the dashboard up through the outage.
            if (!result || isOutageStatus(result.error.status)) {
                return { user: null, sessionUnavailable: true };
            }
            throw new Error(DASHBOARD_AUTH_FAILED_MESSAGE);
        }
        const user = result.data?.user ?? null;
        // Another tab may have switched accounts: stop calling the account API
        // with the previous account's token.
        if (user?.id !== lastDashboardSession?.user?.id) forgetSessionToken();
        lastDashboardSession = { user };
        return lastDashboardSession;
    },
    loader: ({ context }) => {
        const user = context.user;
        const apiKeys = user
            ? accountClient.keys
                  .$get()
                  .then(async (r) =>
                      r.ok ? ((await r.json()).data as ApiKey[]) : null,
                  )
                  .catch(() => null)
            : Promise.resolve([] as ApiKey[]);
        const balance = user
            ? fetchAccountBalance().catch(() => null)
            : Promise.resolve(null);
        const profile = user
            ? accountClient.profile
                  .$get()
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
            : Promise.resolve(null);
        const apps = user
            ? accountClient.apps
                  .$get()
                  .then(async (r) => (r.ok ? (await r.json()).apps : null))
                  .catch(() => null)
            : Promise.resolve([] as ListedApp[]);
        // Developer earnings over the last 7 days, split by which balance
        // the spending users paid from.
        const earnings = user
            ? accountClient.earnings
                  .$get({ query: { days: "7" } })
                  .then(async (r) => {
                      if (!r.ok) return null;
                      const { perEntity } = (await r.json()) as {
                          perEntity: DeveloperEarningsRow[];
                      };
                      return perEntity.reduce(
                          (week, row) => ({
                              paidWeek: week.paidWeek + row.paid_earned,
                              tierWeek: week.tierWeek + row.tier_earned,
                          }),
                          { paidWeek: 0, tierWeek: 0 },
                      );
                  })
                  .catch(() => null)
            : Promise.resolve(null);
        const sessionUser = user as typeof user & {
            githubUsername?: string | null;
        };
        return {
            user,
            sessionUnavailable: context.sessionUnavailable ?? false,
            githubUsername: sessionUser?.githubUsername ?? "",
            apiKeys,
            balance,
            profile,
            apps,
            earnings,
        };
    },
    component: DashboardLayout,
});

export function useDashboardRetry(resource: "balance" | "profile" | "apps") {
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
    const router = useRouter();
    const retry = useDashboardRetry("balance");
    const data = useDeferredValue(Route.useLoaderData());
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    // Pages that need the account wait out the outage; public pages still load.
    const outagePageTitle =
        data.sessionUnavailable && !PUBLIC_PATHS.has(pathname)
            ? ((PAGE_TITLES as Record<string, string>)[pathname] ?? "Account")
            : undefined;
    useOutageRetry(data.sessionUnavailable, "dashboard-session", () =>
        router.invalidate(),
    );

    return (
        <DashboardShell
            navItems={
                data.user || data.sessionUnavailable
                    ? DASHBOARD_NAV_ITEMS
                    : SIGNED_OUT_NAV_ITEMS
            }
            accountName={data.user?.name || data.githubUsername}
            githubAvatarUrl={data.user?.image || ""}
            accountArea={
                data.user ? undefined : data.sessionUnavailable ? (
                    // Who is signed in is unknown: the outage takes the
                    // account's place.
                    <div className="px-1">
                        <SidebarOutage />
                    </div>
                ) : (
                    <SignedOutAccountArea />
                )
            }
            showFooterLinks={Boolean(data.user) || data.sessionUnavailable}
            showQuestStatus={Boolean(data.user)}
            signInBanner={
                data.user || data.sessionUnavailable ? undefined : (
                    <DashboardSignInBanner />
                )
            }
            walletArea={
                data.user ? (
                    // Await adds no boundary for a null fallback; without this
                    // the whole dashboard would wait for the balance.
                    <Suspense fallback={<PageStatus />}>
                        <Await promise={data.balance}>
                            {(balance) =>
                                balance ? (
                                    <Await
                                        promise={data.earnings}
                                        fallback={
                                            <>
                                                <SidebarWallet {...balance} />
                                                <PageStatus />
                                            </>
                                        }
                                    >
                                        {(earnings) => (
                                            <SidebarWallet
                                                {...balance}
                                                {...earnings}
                                            />
                                        )}
                                    </Await>
                                ) : (
                                    <WalletLoadError onRetry={retry} />
                                )
                            }
                        </Await>
                    </Suspense>
                ) : undefined
            }
        >
            {outagePageTitle ? (
                <Section title={outagePageTitle}>
                    <OutageNotice retrying />
                </Section>
            ) : (
                <Outlet />
            )}
        </DashboardShell>
    );
}

/** The drawer's compact outage rows, or the usual error when it is not one. */
function WalletLoadError({ onRetry }: { onRetry: () => unknown }) {
    const outage = useOutage([BALANCE_PATH]);
    // The same resource as the Balance page's balance: one retry for both.
    useOutageRetry(outage, BALANCE_PATH, onRetry);
    return outage ? (
        <SidebarOutage />
    ) : (
        <LoadError onRetry={onRetry} paths={[BALANCE_PATH]}>
            Couldn’t load your balance.
        </LoadError>
    );
}

export function SignedOutAccountArea({
    callbackURL,
}: {
    callbackURL?: string;
} = {}) {
    const { signingInWith, error, signIn } = useSocialSignIn(callbackURL);

    return (
        <div className="flex flex-col gap-2">
            <Button
                as="button"
                intent="brand"
                data-theme="accent"
                onClick={() => void signIn("github")}
                disabled={signingInWith !== null}
                className="w-full justify-center gap-2 text-center"
            >
                <GitHubIcon className="h-4 w-4 shrink-0" />
                {signingInWith === "github"
                    ? "Signing in..."
                    : "Sign in with GitHub"}
            </Button>
            <Button
                as="button"
                intent="brand"
                data-theme="accent"
                onClick={() => void signIn("google")}
                disabled={signingInWith !== null}
                className="w-full justify-center gap-2 text-center"
            >
                <GoogleIcon className="h-4 w-4 shrink-0" />
                {signingInWith === "google"
                    ? "Signing in..."
                    : "Sign in with Google"}
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
