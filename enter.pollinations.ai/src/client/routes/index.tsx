import {
    createFileRoute,
    redirect,
    useRouter,
    Link,
} from "@tanstack/react-router";
import { hc } from "hono/client";
import { useState } from "react";
import { productSlugToUrlParam, type PolarRoutes } from "../../routes/polar.ts";
import type { TiersRoutes } from "../../routes/tiers.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/api-key.tsx";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";
import { User } from "../components/user.tsx";
import { PollenBalance } from "../components/pollen-balance.tsx";
import { TierPanel } from "../components/tier-panel.tsx";
import { FAQ } from "../components/faq.tsx";
import { Header } from "../components/header.tsx";
import { Pricing } from "../components/pricing/index.ts";

export const Route = createFileRoute("/")({
    component: RouteComponent,
    beforeLoad: async ({ context }) => {
        const result = await context.auth.getSession();
        if (result.error) throw new Error("Autentication failed.");
        else if (!result.data?.user) throw redirect({ to: "/sign-in" });
        else return { user: result.data.user };
    },
    loader: async ({ context }) => {
        const honoPolar = hc<PolarRoutes>("/api/polar");
        const honoTiers = hc<TiersRoutes>("/api/tiers");

        // Parallelize independent API calls for faster loading
        const [customer, tierData, apiKeysResult, pendingSpendResult] =
            await Promise.all([
                honoPolar.customer.state
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
                honoTiers.view.$get().then((r) => (r.ok ? r.json() : null)),
                context.auth.apiKey.list(),
                honoPolar.customer["pending-spend"]
                    .$get()
                    .then((r) => (r.ok ? r.json() : null)),
            ]);
        const apiKeys = apiKeysResult.data || [];
        const pendingSpend = pendingSpendResult?.pendingSpend || 0;

        return {
            auth: context.auth,
            user: context.user,
            customer,
            apiKeys,
            tierData,
            pendingSpend,
        };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer, apiKeys, tierData, pendingSpend } =
        Route.useLoaderData();

    const balances = {
        pack:
            customer?.activeMeters.find(
                (m) => m.meterId === config.pollenPackMeterId,
            )?.balance || 0,
        tier:
            customer?.activeMeters.find(
                (m) => m.meterId === config.pollenTierMeterId,
            )?.balance || 0,
    };

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [activationError, setActivationError] = useState<string | null>(null);

    const handleSignOut = async () => {
        if (isSigningOut) return; // Prevent double-clicks
        setIsSigningOut(true);
        try {
            await auth.signOut();
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
        const prefix = isPublishable ? "plln_pk" : "plln_sk";

        // Step 1: Create key via better-auth's native API
        // Note: Expiration is enforced server-side based on prefix
        const createResult = await auth.apiKey.create({
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
            await auth.apiKey.update({
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
        const result = await auth.apiKey.delete({ keyId: id });
        if (result.error) {
            console.error(result.error);
        }
        router.invalidate();
    };

    const handleActivateTier = async () => {
        if (isActivating || !tierData) return;
        setIsActivating(true);
        setActivationError(null);

        try {
            const response = await fetch("/api/tiers/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ target_tier: tierData.target_tier }),
            });

            if (!response.ok) {
                const error = (await response.json()) as { message?: string };
                setActivationError(error.message || "Unknown error");
                setIsActivating(false);
                return;
            }

            const data = (await response.json()) as { checkout_url: string };
            window.location.href = data.checkout_url;
        } catch (error) {
            setActivationError(String(error));
            setIsActivating(false);
        }
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
                            <Button
                                as="a"
                                href="https://github.com/pollinations/pollinations/issues/4826"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="!bg-purple-200 !text-purple-900"
                                color="purple"
                                weight="light"
                            >
                                💳 Vote on payment methods
                            </Button>
                        </div>
                    </div>
                    <PollenBalance
                        balances={balances}
                        dailyPollen={tierData?.daily_pollen}
                        pendingSpend={pendingSpend}
                    />
                </div>
                {tierData && (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                            <h2 className="font-bold flex-1">Tier</h2>
                            {tierData.should_show_activate_button && (
                                <div className="flex gap-3">
                                    <Button
                                        onClick={handleActivateTier}
                                        disabled={isActivating}
                                        color="green"
                                        weight="light"
                                        className="!bg-gray-50"
                                    >
                                        {isActivating
                                            ? "Processing..."
                                            : `Activate ${tierData.target_tier_name}`}
                                    </Button>
                                </div>
                            )}
                        </div>
                        {activationError && (
                            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-900">
                                    ❌ <strong>Activation Failed:</strong>{" "}
                                    {activationError}
                                </p>
                            </div>
                        )}
                        <TierPanel
                            status={tierData.active_tier}
                            next_refill_at_utc={tierData.next_refill_at_utc}
                            active_tier_name={tierData.active_tier_name}
                            daily_pollen={tierData.daily_pollen}
                            subscription_status={tierData.subscription_status}
                            subscription_ends_at={tierData.subscription_ends_at}
                            subscription_canceled_at={
                                tierData.subscription_canceled_at
                            }
                            has_polar_error={tierData.has_polar_error}
                        />
                    </div>
                )}
                <ApiKeyList
                    apiKeys={apiKeys}
                    onCreate={handleCreateApiKey}
                    onDelete={handleDeleteApiKey}
                />
                <FAQ />
                <Pricing />
                <div className="text-center py-8">
                    <Link
                        to="/terms"
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Terms & Conditions
                    </Link>
                </div>
            </div>
        </div>
    );
}
