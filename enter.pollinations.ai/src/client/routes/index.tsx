import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { apiClient } from "../api.ts";
import { authClient, getUserOrRedirect } from "../auth.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/api-keys";
import { PollenBalance, TierPanel } from "../components/balance";
import { Button } from "../components/button.tsx";
import { FAQ } from "../components/faq.tsx";
import { Footer } from "../components/layout/footer.tsx";
import { Header } from "../components/layout/header.tsx";
import { NewsBanner } from "../components/layout/news-banner.tsx";
import { User } from "../components/layout/user.tsx";
import { Pricing } from "../components/pricing";
import {
    TIME_RANGE_DAYS,
    type TimeRange,
    UsageGraph,
} from "../components/usage-analytics";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

export const Route = createFileRoute("/")({
    component: RouteComponent,
    beforeLoad: getUserOrRedirect,
    loader: async ({ context }) => {
        // Parallelize independent API calls for faster loading
        const [tierData, apiKeysResult, d1BalanceResult, profileResult] =
            await Promise.all([
                apiClient.tiers.view
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
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
        const apiKeys = apiKeysResult.data || [];
        const tierBalance = d1BalanceResult?.tierBalance ?? 0;
        const creatorBalance = d1BalanceResult?.creatorBalance ?? 0;
        const packBalance = d1BalanceResult?.packBalance ?? 0;
        const cryptoBalance = d1BalanceResult?.cryptoBalance ?? 0;
        // Prefer D1 — session (KV-cached) may hold a stale username after relog.
        const githubUsername =
            profileResult?.githubUsername ?? context.user?.githubUsername ?? "";

        return {
            user: context.user,
            githubUsername,
            apiKeys,
            tierData,
            tierBalance,
            creatorBalance,
            packBalance,
            cryptoBalance,
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
        creatorBalance,
        packBalance,
        cryptoBalance,
    } = Route.useLoaderData();

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [activeTab, setActiveTab] = useState<"balance" | "usage">("balance");
    const [usageTimeRange, setUsageTimeRange] = useState<TimeRange>("7d");
    const usageDays = TIME_RANGE_DAYS[usageTimeRange];

    const selectableKeys = useMemo(
        () =>
            apiKeys
                .filter((k): k is typeof k & { name: string } => !!k.name)
                .map((k) => ({ id: k.id, name: k.name })),
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
                ...(isPublishable && { plaintextKey: "" }), // Placeholder, updated below
            },
            permissions: {
                allowedModels: formState.allowedModels,
                pollenBudget: formState.pollenBudget,
                accountPermissions: formState.accountPermissions?.length
                    ? formState.accountPermissions
                    : undefined,
            },
        });

        // Store plaintext key and app settings for publishable keys
        if (isPublishable) {
            const metaRes = await fetch(
                `/api/api-keys/${created.id}/metadata`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        description: formState.description,
                        keyType,
                        plaintextKey: created.key,
                        ...(formState.appUrl && { appUrl: formState.appUrl }),
                    }),
                },
            );
            if (!metaRes.ok) {
                const err = await metaRes.json().catch(() => null);
                throw new Error(
                    (err as { error?: { message?: string } })?.error?.message ||
                        "Failed to save key metadata",
                );
            }
        }

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
            days: usageDays.toString(),
            limit: DETAILED_USAGE_DOWNLOAD_LIMIT.toString(),
        });
        const anchor = document.createElement("a");
        anchor.href = `/api/account/usage?${params.toString()}`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-20">
                <Header>
                    <User
                        githubUsername={githubUsername}
                        githubAvatarUrl={user?.image || ""}
                        onSignOut={handleSignOut}
                    />
                    <Button
                        as="a"
                        href="/api/docs"
                        className="bg-gray-900 text-white hover:!brightness-90 whitespace-nowrap"
                    >
                        API Reference
                    </Button>
                </Header>
                <NewsBanner />
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <h2 className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setActiveTab("balance")}
                                className={`font-bold ${
                                    activeTab === "balance"
                                        ? "text-amber-900"
                                        : "text-gray-400 hover:text-gray-600 cursor-pointer"
                                }`}
                            >
                                Balance
                            </button>
                            <span className="text-gray-300">·</span>
                            <button
                                type="button"
                                onClick={() => setActiveTab("usage")}
                                className={`font-bold ${
                                    activeTab === "usage"
                                        ? "text-amber-900"
                                        : "text-gray-400 hover:text-gray-600 cursor-pointer"
                                }`}
                            >
                                Usage
                            </button>
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                            {activeTab === "usage" && (
                                <Button
                                    as="button"
                                    color="amber"
                                    weight="light"
                                    onClick={downloadDetailedUsage}
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
                            )}
                        </div>
                    </div>
                    {activeTab === "balance" && (
                        <PollenBalance
                            tierBalance={tierBalance}
                            creatorBalance={creatorBalance}
                            packBalance={packBalance}
                            cryptoBalance={cryptoBalance}
                            tier={tierData?.active?.tier}
                        />
                    )}
                    {activeTab === "usage" && (
                        <UsageGraph
                            tier={tierData?.active?.tier}
                            timeRange={usageTimeRange}
                            onTimeRangeChange={setUsageTimeRange}
                            apiKeys={selectableKeys}
                        />
                    )}
                </div>
                {tierData && (
                    <div className="flex flex-col gap-2">
                        <h2 className="font-bold">Tier</h2>
                        <TierPanel {...tierData} />
                    </div>
                )}
                <ApiKeyList
                    apiKeys={apiKeys}
                    onCreate={handleCreateApiKey}
                    onUpdate={handleUpdateApiKey}
                    onDelete={handleDeleteApiKey}
                />
                <Pricing
                    tierBalance={tierBalance}
                    creatorBalance={creatorBalance}
                    packBalance={packBalance}
                    cryptoBalance={cryptoBalance}
                />
                <FAQ />
                <Footer />
            </div>
        </div>
    );
}
