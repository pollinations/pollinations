import {
    createFileRoute,
    redirect,
    useRouter,
    Link,
} from "@tanstack/react-router";
import { hc } from "hono/client";
import { useState } from "react";
import type { PolarRoutes } from "../../routes/polar.ts";
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
import { UsageSparkline } from "../components/usage-sparkline.tsx";

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
        const [customer, tierData, apiKeysResult] = await Promise.all([
            honoPolar.customer.state
                .$get()
                .then((r) => (r.ok ? r.json() : null)),
            honoTiers.view.$get().then((r) => (r.ok ? r.json() : null)),
            context.auth.apiKey.list(),
        ]);
        const apiKeys = apiKeysResult.data || [];

        return {
            auth: context.auth,
            user: context.user,
            customer,
            apiKeys,
            tierData,
        };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer, apiKeys, tierData } = Route.useLoaderData();

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
        const result = await auth.apiKey.create({
            name: formState.name,
            prefix: keyType === "publishable" ? "plln_pk" : "plln_sk",
            metadata: { description: formState.description, keyType },
        });
        if (result.error) {
            // TODO: handle it
            console.error(result.error);
        }

        // For publishable keys, store the plaintext key in metadata for easy retrieval
        if (keyType === "publishable" && result.data) {
            const apiKey = result.data as CreateApiKeyResponse;
            await auth.apiKey.update({
                keyId: apiKey.id,
                metadata: {
                    plaintextKey: apiKey.key, // Store plaintext key in metadata
                    keyType,
                },
            });
        }

        router.invalidate();
        return result.data as CreateApiKeyResponse;
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

        try {
            const response = await fetch("/api/tiers/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ target_tier: tierData.assigned_tier }),
            });

            if (!response.ok) {
                const error = (await response.json()) as { message?: string };
                alert(`Activation failed: ${error.message || "Unknown error"}`);
                setIsActivating(false);
                return;
            }

            const data = (await response.json()) as { checkout_url: string };
            window.location.href = data.checkout_url;
        } catch (error) {
            alert(`Activation failed: ${error}`);
            setIsActivating(false);
        }
    };

    return (
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
                <Button as="a" href="/api/docs" className="bg-gray-900 text-white hover:!brightness-90">
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
                            disabled
                        >
                            + $5
                        </Button>
                        <Button
                            as="button"
                            color="purple"
                            weight="light"
                            disabled
                        >
                            + $10
                        </Button>
                        <Button as="button" color="purple" weight="light" disabled>
                            + $20
                        </Button>
                        <a
                            href="https://github.com/pollinations/pollinations/issues/4826"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-700 hover:text-purple-900 font-medium transition-colors"
                        >
                            💳 Vote on payment methods →
                        </a>
                    </div>
                </div>
                <PollenBalance balances={balances} dailyPollen={tierData?.daily_pollen} />
                <UsageSparkline />
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
                                >
                                    {isActivating
                                        ? "Processing..."
                                        : `Activate ${tierData.assigned_tier[0].toUpperCase() + tierData.assigned_tier.slice(1)} Tier`}
                                </Button>
                            </div>
                        )}
                    </div>
                    {tierData.has_polar_error && (
                        <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
                            Unable to fetch current subscription status. Showing
                            fallback data.
                        </div>
                    )}
                    <TierPanel
                        status={tierData.active_tier}
                        assigned_tier={tierData.assigned_tier}
                        next_refill_at_utc={tierData.next_refill_at_utc}
                        product_name={tierData.product_name}
                        daily_pollen={tierData.daily_pollen}
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
    );
}
