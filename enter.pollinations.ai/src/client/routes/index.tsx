import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient, getUserOrRedirect } from "../auth.ts";
import {
    type ApiKey,
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/api-keys";
import {
    BuyPollenPanel,
    PollenBalance,
    SidebarWallet,
    TierPanel,
} from "../components/balance";
import { Button } from "../components/button.tsx";
import { DashboardSection } from "../components/layout/dashboard-section.tsx";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import {
    dashboardThemeByPage,
    isDashboardPage,
    type ThemeName,
} from "../components/layout/dashboard-theme.ts";
import { UpdatesPage } from "../components/layout/updates-page.tsx";
import { Pricing } from "../components/pricing";
import {
    currentUsagePeriod,
    EarningsGraph,
    getEarningsEnabledApps,
    PeriodPicker,
    UsageGraph,
    type UsagePeriodSelection,
} from "../components/usage-analytics";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

function DownloadCsvButton({
    theme,
    onClick,
}: {
    theme: ThemeName;
    onClick: () => void;
}) {
    return (
        <Button
            as="button"
            theme={theme}
            weight="light"
            onClick={onClick}
            className="flex items-center gap-1.5"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <title>Download</title>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download CSV
        </Button>
    );
}

function pageFromHash(hash: string): DashboardPage {
    const page = hash.replace(/^#/, "");
    if (isDashboardPage(page)) return page;
    if (page === "news" || page === "faq") return "updates";
    if (page === "buy-pollen") return "pollen";
    if (page === "pricing") return "models";
    if (page === "earnings") return "usage";
    // Kebab-case slugs are FAQ anchors — route to updates and let the
    // FAQ component scroll/expand the matching question.
    if (page && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(page)) return "updates";
    return "pollen";
}

export const Route = createFileRoute("/")({
    component: RouteComponent,
    beforeLoad: getUserOrRedirect,
    loader: async ({ context }) => {
        // Parallelize independent API calls for faster loading
        const [
            tierData,
            apiKeysResult,
            d1BalanceResult,
            profileResult,
            billingState,
            earningsTodayResult,
        ] = await Promise.all([
            apiClient.tiers.view.$get().then((r) => (r.ok ? r.json() : null)),
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
        const apiKeys = (apiKeysResult.data || []) as ApiKey[];
        const tierBalance = d1BalanceResult?.tierBalance ?? 0;
        const packBalance = d1BalanceResult?.packBalance ?? 0;
        const paidWeek = earningsTodayResult?.paidWeek ?? 0;
        const tierWeek = earningsTodayResult?.tierWeek ?? 0;
        // Prefer D1; session (KV-cached) may hold a stale username after relog.
        const sessionUser = context.user as
            | (typeof context.user & { githubUsername?: string | null })
            | undefined;
        const githubUsername =
            profileResult?.githubUsername ?? sessionUser?.githubUsername ?? "";

        return {
            user: context.user,
            githubUsername,
            apiKeys,
            tierData,
            tierBalance,
            packBalance,
            billingState,
            paidWeek,
            tierWeek,
        };
    },
});

function RouteComponent() {
    const router = useRouter();
    const {
        user,
        githubUsername,
        apiKeys,
        tierData,
        tierBalance,
        packBalance,
        billingState,
        paidWeek,
        tierWeek,
    } = Route.useLoaderData();

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [activePage, setActivePage] = useState<DashboardPage>(() =>
        pageFromHash(typeof window === "undefined" ? "" : window.location.hash),
    );
    const [activityPeriod, setActivityPeriod] =
        useState<UsagePeriodSelection>(currentUsagePeriod);

    useEffect(() => {
        function syncPageFromHash(): void {
            setActivePage(pageFromHash(window.location.hash));
        }

        window.addEventListener("hashchange", syncPageFromHash);
        return () => window.removeEventListener("hashchange", syncPageFromHash);
    }, []);

    const selectableKeys = useMemo(
        () =>
            apiKeys
                .filter((k): k is typeof k & { name: string } => !!k.name)
                .map((k) => ({ id: k.id, name: k.name })),
        [apiKeys],
    );

    const earningsEnabledApps = useMemo(
        () => getEarningsEnabledApps(apiKeys),
        [apiKeys],
    );

    async function handleSignOut(): Promise<void> {
        if (isSigningOut) return;
        setIsSigningOut(true);
        try {
            await authClient.signOut();
            window.location.href = "/";
        } catch (error) {
            console.error("Sign out failed:", error);
        } finally {
            setIsSigningOut(false);
        }
    }

    async function handleCreateApiKey(
        formState: CreateApiKey,
    ): Promise<CreateApiKeyResponse> {
        const keyType = formState.keyType || "secret";
        const isPublishable = keyType === "publishable";

        const created = await createKeyWithPermissions({
            name: formState.name,
            prefix: isPublishable ? "pk" : "sk",
            expiryDays: formState.expiryDays,
            metadata: {
                description: formState.description,
                keyType,
                ...(isPublishable && formState.redirectUris?.length
                    ? { redirectUris: formState.redirectUris }
                    : {}),
                ...(isPublishable
                    ? { earningsEnabled: formState.earningsEnabled === true }
                    : {}),
            },
            permissions: {
                allowedModels: formState.allowedModels,
                pollenBudget: formState.pollenBudget,
                accountPermissions: formState.accountPermissions?.length
                    ? formState.accountPermissions
                    : undefined,
            },
        });

        router.invalidate();
        return {
            id: created.id,
            key: created.key,
            name: created.name,
        } as CreateApiKeyResponse;
    }

    async function handleDeleteApiKey(id: string): Promise<void> {
        const result = await authClient.apiKey.delete({ keyId: id });
        if (result.error) {
            console.error(result.error);
        }
        router.invalidate();
    }

    async function handleUpdateApiKey(
        id: string,
        updates: {
            name?: string;
            allowedModels?: string[] | null;
            pollenBudget?: number | null;
            accountPermissions?: string[] | null;
            expiresAt?: Date | null;
        },
    ): Promise<void> {
        const response = await fetch(`/api/api-keys/${id}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                (error as { message?: string }).message || "Update failed",
            );
        }
        router.invalidate();
    }

    function downloadDetailedUsage(): void {
        const params = new URLSearchParams({
            format: "csv",
            granularity: activityPeriod.granularity,
            period: activityPeriod.period,
            limit: DETAILED_USAGE_DOWNLOAD_LIMIT.toString(),
        });
        const anchor = document.createElement("a");
        anchor.href = `/api/account/usage?${params.toString()}`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    function handlePageChange(page: DashboardPage): void {
        setActivePage(page);
        try {
            history.replaceState(null, "", `#${page}`);
        } catch {
            // Hash updates are cosmetic; navigation still works without them.
        }
        window.scrollTo({ top: 0, behavior: "auto" });
    }

    return (
        <DashboardShell
            activePage={activePage}
            githubUsername={githubUsername}
            githubAvatarUrl={user?.image || ""}
            onPageChange={handlePageChange}
            onSignOut={handleSignOut}
            walletArea={
                <SidebarWallet
                    tierBalance={tierBalance}
                    packBalance={packBalance}
                    tier={tierData?.active?.tier}
                    paidWeek={paidWeek}
                    tierWeek={tierWeek}
                />
            }
        >
            {activePage === "updates" && <UpdatesPage />}
            {activePage === "pollen" && (
                <div className="flex flex-col gap-6">
                    <DashboardSection title="Wallet" theme="amber" framed>
                        <PollenBalance
                            tierBalance={tierBalance}
                            packBalance={packBalance}
                            tier={tierData?.active?.tier}
                            paidWeek={paidWeek}
                            tierWeek={tierWeek}
                        />
                    </DashboardSection>
                    <DashboardSection
                        title="Top-up"
                        theme="amber"
                        framed
                        id="buy-pollen"
                    >
                        <BuyPollenPanel initialBillingState={billingState} />
                    </DashboardSection>
                    {tierData && (
                        <DashboardSection title="Tier" theme="amber" framed>
                            <TierPanel {...tierData} />
                        </DashboardSection>
                    )}
                </div>
            )}
            {activePage === "usage" && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1">
                        <PeriodPicker
                            value={activityPeriod}
                            onChange={setActivityPeriod}
                            theme={dashboardThemeByPage.usage}
                        />
                        <p className="text-3xs text-gray-400">
                            Data refreshes every hour. Times shown in UTC.
                        </p>
                    </div>
                    <UsageGraph
                        tier={tierData?.active?.tier}
                        period={activityPeriod}
                        apiKeys={selectableKeys}
                        theme={dashboardThemeByPage.usage}
                        action={
                            <DownloadCsvButton
                                theme={dashboardThemeByPage.usage}
                                onClick={downloadDetailedUsage}
                            />
                        }
                    />
                    {earningsEnabledApps.length > 0 && (
                        <EarningsGraph
                            period={activityPeriod}
                            apps={earningsEnabledApps}
                            theme={dashboardThemeByPage.usage}
                        />
                    )}
                </div>
            )}
            {activePage === "keys" && (
                <ApiKeyList
                    apiKeys={apiKeys}
                    onCreate={handleCreateApiKey}
                    onUpdate={handleUpdateApiKey}
                    onDelete={handleDeleteApiKey}
                />
            )}
            {activePage === "models" && (
                <Pricing tierBalance={tierBalance} packBalance={packBalance} />
            )}
        </DashboardShell>
    );
}
