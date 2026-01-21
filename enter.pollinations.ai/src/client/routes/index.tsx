import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { productSlugToUrlParam } from "../../routes/polar.ts";
import { apiClient } from "../api.ts";
import { authClient, getUserOrRedirect } from "../auth.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/api-key.tsx";
import { Button } from "../components/button.tsx";
import { FAQ } from "../components/faq.tsx";
import { Footer } from "../components/footer.tsx";
import { Header } from "../components/header.tsx";
import { PollenBalance } from "../components/pollen-balance.tsx";
import { Pricing } from "../components/pricing/index.ts";
import { TierPanel } from "../components/tier-panel.tsx";
import { UsageGraph } from "../components/usage-analytics";
import { User } from "../components/user.tsx";

export const Route = createFileRoute("/")({
    component: RouteComponent,
    beforeLoad: getUserOrRedirect,
    loader: async ({ context }) => {
        // Parallelize independent API calls for faster loading
        const [customer, tierData, apiKeysResult, d1BalanceResult] =
            await Promise.all([
                apiClient.polar.customer.state
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
                apiClient.tiers.view
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
                apiClient["api-keys"]
                    .$get()
                    .then((r) => (r.ok ? r.json() : { data: [] })),
                apiClient.polar.customer["d1-balance"]
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
            ]);
        const apiKeys = apiKeysResult.data || [];
        const tierBalance = d1BalanceResult?.tierBalance ?? 0;
        const packBalance = d1BalanceResult?.packBalance ?? 0;
        const cryptoBalance = d1BalanceResult?.cryptoBalance ?? 0;

        return {
            user: context.user,
            customer,
            apiKeys,
            tierData,
            tierBalance,
            packBalance,
            cryptoBalance,
        };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { user, apiKeys, tierData, tierBalance, packBalance, cryptoBalance } =
        Route.useLoaderData();

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [activeTab, setActiveTab] = useState<"balance" | "usage">("balance");
    const [downloadOpen, setDownloadOpen] = useState(false);
    const [downloadingDetailed, setDownloadingDetailed] = useState(false);
    const downloadRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                downloadRef.current &&
                !downloadRef.current.contains(e.target as Node)
            ) {
                setDownloadOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        if (isSigningOut) return; // Prevent double-clicks
        setIsSigningOut(true);
        try {
            await authClient.signOut();
            window.location.href = "/";
        } catch (error) {
            console.error("Sign out failed:", error);
        } finally {
            setIsSigningOut(false);
        }
    };

    const handleCreateApiKey = async (formState: CreateApiKey) => {
        const keyType = formState.keyType || "secret";
        const isPublishable = keyType === "publishable";
        const prefix = isPublishable ? "pk" : "sk";

        // Step 1: Create key via better-auth's native API
        const SECONDS_PER_DAY = 24 * 60 * 60;
        const createResult = await authClient.apiKey.create({
            name: formState.name,
            prefix,
            ...(formState.expiryDays !== null &&
                formState.expiryDays !== undefined && {
                    expiresIn: formState.expiryDays * SECONDS_PER_DAY,
                }),
            metadata: {
                description: formState.description,
                keyType,
            },
        });

        if (createResult.error || !createResult.data) {
            console.error("Failed to create API key:", createResult.error);
            throw new Error(
                createResult.error?.message || "Failed to create API key",
            );
        }

        const apiKey = createResult.data;

        // For publishable keys, store the plaintext key in metadata for easy retrieval
        if (isPublishable) {
            await authClient.apiKey.update({
                keyId: apiKey.id,
                metadata: {
                    description: formState.description,
                    keyType,
                    plaintextKey: apiKey.key,
                },
            });
        }

        // Step 2: Set permissions and/or budget if provided
        // allowedModels: null = unrestricted (all models), array = restricted to specific models
        // pollenBudget: null = unlimited, number = budget cap
        // accountPermissions: null = no permissions, array = enabled permissions
        const hasAllowedModels =
            formState.allowedModels !== null &&
            formState.allowedModels !== undefined;
        const hasPollenBudget =
            formState.pollenBudget !== null &&
            formState.pollenBudget !== undefined;
        const hasAccountPermissions =
            formState.accountPermissions !== null &&
            formState.accountPermissions !== undefined &&
            formState.accountPermissions.length > 0;

        if (hasAllowedModels || hasPollenBudget || hasAccountPermissions) {
            const updateResponse = await fetch(
                `/api/api-keys/${apiKey.id}/update`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        ...(hasAllowedModels && {
                            allowedModels: formState.allowedModels,
                        }),
                        ...(hasPollenBudget && {
                            pollenBudget: formState.pollenBudget,
                        }),
                        ...(hasAccountPermissions && {
                            accountPermissions: formState.accountPermissions,
                        }),
                    }),
                },
            );

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                console.error(
                    "Failed to set API key permissions/budget:",
                    errorData,
                );
                // Key was created but update failed - throw so user knows
                throw new Error(
                    `Key created but failed to set budget/permissions: ${(errorData as { message?: string }).message || "Unknown error"}`,
                );
            }
        }

        router.invalidate();
        return {
            id: apiKey.id,
            key: apiKey.key,
            name: apiKey.name,
        } as CreateApiKeyResponse;
    };

    const handleDeleteApiKey = async (id: string) => {
        const result = await authClient.apiKey.delete({ keyId: id });
        if (result.error) {
            console.error(result.error);
        }
        router.invalidate();
    };

    const handleUpdateApiKey = async (
        id: string,
        updates: {
            allowedModels?: string[] | null;
            pollenBudget?: number | null;
            enabled?: boolean;
        },
    ) => {
        const response = await fetch(`/api/api-keys/${id}/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                (errorData as { message?: string }).message || "Update failed",
            );
        }
        router.invalidate();
    };

    const handleBuyPollen = (slug: string) => {
        // Navigate directly to Polar checkout endpoint - server will handle redirect
        window.location.href = `/api/polar/checkout/${productSlugToUrlParam(slug)}?redirect=true`;
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-20">
                <Header>
                    <User
                        githubUsername={user?.githubUsername || ""}
                        githubAvatarUrl={user?.image || ""}
                        onSignOut={handleSignOut}
                        onUserPortal={() => {
                            window.location.href = "/api/polar/customer/portal";
                        }}
                    />
                    <Button
                        as="a"
                        href="/api/docs"
                        className="bg-gray-900 text-white hover:!brightness-90 whitespace-nowrap"
                    >
                        API Reference
                    </Button>
                </Header>
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <h2 className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setActiveTab("balance")}
                                className={`font-bold ${
                                    activeTab === "balance"
                                        ? "text-green-950"
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
                                        ? "text-green-950"
                                        : "text-gray-400 hover:text-gray-600 cursor-pointer"
                                }`}
                            >
                                Usage
                            </button>
                        </h2>
                        {activeTab === "balance" && (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    as="button"
                                    color="violet"
                                    weight="light"
                                    onClick={() =>
                                        handleBuyPollen("v1:product:pack:5x2")
                                    }
                                >
                                    + $5
                                </Button>
                                <Button
                                    as="button"
                                    color="violet"
                                    weight="light"
                                    onClick={() =>
                                        handleBuyPollen("v1:product:pack:10x2")
                                    }
                                >
                                    + $10
                                </Button>
                                <Button
                                    as="button"
                                    color="violet"
                                    weight="light"
                                    onClick={() =>
                                        handleBuyPollen("v1:product:pack:20x2")
                                    }
                                >
                                    + $20
                                </Button>
                                <Button
                                    as="button"
                                    color="violet"
                                    weight="light"
                                    onClick={() =>
                                        handleBuyPollen("v1:product:pack:50x2")
                                    }
                                >
                                    + $50
                                </Button>
                            </div>
                        )}
                        {activeTab === "usage" && (
                            <div ref={downloadRef} className="relative">
                                <Button
                                    as="button"
                                    color="violet"
                                    weight="light"
                                    onClick={() =>
                                        setDownloadOpen(!downloadOpen)
                                    }
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
                                    Download
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={`transition-transform ${downloadOpen ? "rotate-180" : ""}`}
                                    >
                                        <title>Toggle</title>
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </Button>
                                {downloadOpen && (
                                    <div className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(
                                                        "/api/account/usage/daily?format=csv",
                                                    );
                                                    if (!res.ok)
                                                        throw new Error(
                                                            "Failed to fetch",
                                                        );
                                                    const blob =
                                                        await res.blob();
                                                    const url =
                                                        URL.createObjectURL(
                                                            blob,
                                                        );
                                                    const a =
                                                        document.createElement(
                                                            "a",
                                                        );
                                                    a.href = url;
                                                    a.download =
                                                        "usage-daily.csv";
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                } catch (e) {
                                                    console.error(
                                                        "Download failed:",
                                                        e,
                                                    );
                                                } finally {
                                                    setDownloadOpen(false);
                                                }
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                            Daily Summary
                                            <span className="block text-xs text-gray-400">
                                                Aggregated by day
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setDownloadingDetailed(true);
                                                try {
                                                    const res = await fetch(
                                                        "/api/account/usage?format=csv&limit=50000",
                                                    );
                                                    if (!res.ok)
                                                        throw new Error(
                                                            "Failed to fetch",
                                                        );
                                                    const blob =
                                                        await res.blob();
                                                    const url =
                                                        URL.createObjectURL(
                                                            blob,
                                                        );
                                                    const a =
                                                        document.createElement(
                                                            "a",
                                                        );
                                                    a.href = url;
                                                    a.download =
                                                        "usage-detailed.csv";
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                } catch (e) {
                                                    console.error(
                                                        "Download failed:",
                                                        e,
                                                    );
                                                } finally {
                                                    setDownloadingDetailed(
                                                        false,
                                                    );
                                                    setDownloadOpen(false);
                                                }
                                            }}
                                            disabled={downloadingDetailed}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {downloadingDetailed
                                                ? "Downloading..."
                                                : "Detailed Usage"}
                                            <span className="block text-xs text-gray-400">
                                                Per-request data
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {activeTab === "balance" && (
                        <PollenBalance
                            tierBalance={tierBalance}
                            packBalance={packBalance}
                            cryptoBalance={cryptoBalance}
                        />
                    )}
                    {activeTab === "usage" && (
                        <UsageGraph tier={tierData?.active?.tier} />
                    )}
                </div>
                {tierData && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                            <h2 className="font-bold flex-1">Tier</h2>
                        </div>
                        <TierPanel {...tierData} />
                    </div>
                )}
                <ApiKeyList
                    apiKeys={apiKeys}
                    onCreate={handleCreateApiKey}
                    onUpdate={handleUpdateApiKey}
                    onDelete={handleDeleteApiKey}
                />
                <FAQ />
                <Pricing />
                <Footer />
            </div>
        </div>
    );
}
