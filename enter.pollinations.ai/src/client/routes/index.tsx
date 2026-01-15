import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
import { Header } from "../components/header.tsx";
import { PollenBalance } from "../components/pollen-balance.tsx";
import { Pricing } from "../components/pricing/index.ts";
import { TierPanel } from "../components/tier-panel.tsx";
import { UsageGraph } from "../components/usage-graph.tsx";
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
                authClient.apiKey.list(),
                apiClient.polar.customer["d1-balance"]
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
            ]);
        const apiKeys = apiKeysResult.data || [];
        const tierBalance = d1BalanceResult?.tierBalance ?? 0;
        const packBalance = d1BalanceResult?.packBalance ?? 0;

        return {
            user: context.user,
            customer,
            apiKeys,
            tierData,
            tierBalance,
            packBalance,
        };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { user, apiKeys, tierData, tierBalance, packBalance } =
        Route.useLoaderData();

    const [isSigningOut, setIsSigningOut] = useState(false);

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
        const createResult = await authClient.apiKey.create({
            name: formState.name,
            prefix,
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

        // Step 2: Set permissions if restricted (allowedModels is not null)
        // null = unrestricted (all models), array = restricted to specific models
        if (
            formState.allowedModels !== null &&
            formState.allowedModels !== undefined
        ) {
            const updateResponse = await fetch(
                `/api/api-keys/${apiKey.id}/update`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        allowedModels: formState.allowedModels,
                    }),
                },
            );

            if (!updateResponse.ok) {
                const errorData = await updateResponse.json();
                console.error("Failed to set API key permissions:", errorData);
                // Key was created but permissions failed - still return the key
                // User can update permissions later
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

    const handleBuyPollen = (slug: string) => {
        // Navigate directly to checkout endpoint - server will handle redirect
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
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                        <h2 className="font-bold flex-1">Balance</h2>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Button
                                as="button"
                                color="purple"
                                weight="light"
                                onClick={() =>
                                    handleBuyPollen("v1:product:pack:5x2")
                                }
                            >
                                + $5
                            </Button>
                            <Button
                                as="button"
                                color="purple"
                                weight="light"
                                onClick={() =>
                                    handleBuyPollen("v1:product:pack:10x2")
                                }
                            >
                                + $10
                            </Button>
                            <Button
                                as="button"
                                color="purple"
                                weight="light"
                                onClick={() =>
                                    handleBuyPollen("v1:product:pack:20x2")
                                }
                            >
                                + $20
                            </Button>
                            <Button
                                as="button"
                                color="purple"
                                weight="light"
                                onClick={() =>
                                    handleBuyPollen("v1:product:pack:50x2")
                                }
                            >
                                + $50
                            </Button>
                        </div>
                    </div>
                    <PollenBalance
                        tierBalance={tierBalance}
                        packBalance={packBalance}
                    />
                </div>
                <UsageGraph apiKeys={apiKeys} />
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
                    onDelete={handleDeleteApiKey}
                />
                <FAQ />
                <Pricing />
                <div className="bg-violet-50/20 border border-violet-200/50 rounded-xl px-6 py-4 mt-4 w-fit mx-auto">
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-3 text-sm text-gray-400">
                        <span>© 2026 Myceli.AI</span>
                        <span className="hidden sm:inline">·</span>
                        <Link
                            to="/terms"
                            className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                        >
                            Terms & Conditions
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
