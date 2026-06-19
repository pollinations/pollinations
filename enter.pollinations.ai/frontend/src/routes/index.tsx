import { Button, DownloadIcon, Section } from "@pollinations/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient, getUserOrRedirect } from "../auth.ts";
import {
    currentUsagePeriod,
    EarningsGraph,
    getEarningsEnabledApps,
    PeriodPicker,
    TransactionHistory,
    UsageGraph,
    type UsagePeriodSelection,
} from "../components/activity";
import {
    type ApiKey,
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/keys";
import {
    type DashboardPage,
    DashboardShell,
} from "../components/layout/dashboard-shell.tsx";
import { isDashboardPage } from "../components/layout/dashboard-theme.ts";
import { usePageFromHash } from "../components/layout/use-page-from-hash.ts";
import { Models } from "../components/models";
import { NewsFaq } from "../components/news-faq";
import {
    BuyPollenPanel,
    PollenBalance,
    SidebarWallet,
    TierPanel,
} from "../components/pollen";
import { QuestOverview } from "../components/quests";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;
const ACTIVITY_MIN_DATE = new Date("2026-01-01T00:00:00.000Z");

function DownloadCsvButton({ onClick }: { onClick: () => void }) {
    return (
        <Button
            as="button"
            onClick={onClick}
            className="flex items-center gap-1.5"
        >
            <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
            Download CSV
        </Button>
    );
}

function pageFromHash(hash: string): DashboardPage {
    const page = hash.replace(/^#/, "");
    if (isDashboardPage(page)) return page;
    if (page === "news" || page === "faq" || page === "updates")
        return "news-faq";
    if (page === "buy-pollen") return "pollen";
    if (page === "pricing") return "models";
    if (page === "earnings" || page === "usage") return "activity";
    // Kebab-case slugs are FAQ anchors — route to news-faq and let the
    // FAQ component scroll/expand the matching question.
    if (page && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(page)) return "news-faq";
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
    const [activePage, setActivePage] = usePageFromHash(pageFromHash);
    const [activityPeriod, setActivityPeriod] =
        useState<UsagePeriodSelection>(currentUsagePeriod);

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
        const json = {
            ...updates,
            expiresAt:
                updates.expiresAt instanceof Date
                    ? updates.expiresAt.toISOString()
                    : updates.expiresAt,
        };
        const response = await apiClient["api-keys"][":id"].update.$post({
            param: { id },
            json,
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
            history.replaceState(
                null,
                "",
                `${window.location.pathname}${window.location.search}#${page}`,
            );
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
            {activePage === "news-faq" && <NewsFaq />}
            {activePage === "pollen" && (
                <div className="flex flex-col gap-6">
                    <Section title="Wallet" framed>
                        <PollenBalance
                            tierBalance={tierBalance}
                            packBalance={packBalance}
                            tier={tierData?.active?.tier}
                            paidWeek={paidWeek}
                            tierWeek={tierWeek}
                        />
                    </Section>
                    <Section title="Top-up" framed id="buy-pollen">
                        <BuyPollenPanel initialBillingState={billingState} />
                    </Section>
                    {tierData && (
                        <Section title="Tier" framed>
                            <TierPanel {...tierData} />
                        </Section>
                    )}
                    <Section title="Recent transactions" framed>
                        <TransactionHistory
                            mode="compact"
                            apiKeys={selectableKeys}
                        />
                    </Section>
                </div>
            )}
            {activePage === "activity" && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1">
                        <PeriodPicker
                            value={activityPeriod}
                            onChange={setActivityPeriod}
                            minDate={ACTIVITY_MIN_DATE}
                        />
                        <p className="text-micro text-theme-text-muted">
                            Usage data refreshes every hour. Chart buckets use
                            UTC; transactions use your local time.
                        </p>
                    </div>
                    <UsageGraph
                        period={activityPeriod}
                        apiKeys={selectableKeys}
                        action={
                            <DownloadCsvButton
                                onClick={downloadDetailedUsage}
                            />
                        }
                    />
                    {earningsEnabledApps.length > 0 && (
                        <EarningsGraph
                            period={activityPeriod}
                            apps={earningsEnabledApps}
                        />
                    )}
                    <Section title="Transactions" framed>
                        <TransactionHistory
                            mode="full"
                            apiKeys={selectableKeys}
                        />
                    </Section>
                </div>
            )}
            {activePage === "quests" && (
                <Section title="Quests" framed>
                    <QuestOverview />
                </Section>
            )}
            {activePage === "keys" && (
                <ApiKeyList
                    apiKeys={apiKeys}
                    onCreate={handleCreateApiKey}
                    onUpdate={handleUpdateApiKey}
                    onDelete={handleDeleteApiKey}
                />
            )}
            {activePage === "models" && <Models />}
        </DashboardShell>
    );
}
