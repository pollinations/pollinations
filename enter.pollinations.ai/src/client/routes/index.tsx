import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
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

export const Route = createFileRoute("/")({
    component: RouteComponent,
    loader: async ({ context }) => {
        if (!context.user) throw redirect({ to: "/sign-in" });
        const honoPolar = hc<PolarRoutes>("/api/polar");
        const honoTiers = hc<TiersRoutes>("/api/tiers");
        
        const stateResult = await honoPolar.customer.state.$get();
        const customer = stateResult.ok ? await stateResult.json() : null;
        
        const tiersResult = await honoTiers.view.$get();
        const tierData = tiersResult.ok ? await tiersResult.json() : null;
        
        // Use better-auth's built-in list() method which returns metadata
        const apiKeysResult = await context.auth.apiKey.list();
        const apiKeys = apiKeysResult.data || [];

        console.log(context.user);
        return { auth: context.auth, user: context.user, customer, apiKeys, tierData };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer, apiKeys, tierData } = Route.useLoaderData();
    const meter = customer?.activeMeters.filter(
        (meter) => meter.meterId === config.pollenMeterId,
    )[0];
    const balance = meter?.balance || 0;

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
        const keyType = formState.keyType || "private";
        
        const createKeyData = {
            name: formState.name,
            prefix: keyType === "public" ? "pk" : "sk", // Set prefix based on key type
            metadata: {
                description: formState.description,
                keyType,
            },
        };
        const result = await auth.apiKey.create(createKeyData);
        if (result.error) {
            // TODO: handle it
            console.error(result.error);
        }
        
        // For public keys, store the plaintext key in metadata for easy retrieval
        if (keyType === "public" && result.data) {
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
                body: JSON.stringify({ target_tier: tierData.status }),
            });

            if (!response.ok) {
                const error = await response.json() as { message?: string };
                alert(`Activation failed: ${error.message || "Unknown error"}`);
                setIsActivating(false);
                return;
            }

            const data = await response.json() as { checkout_url: string };
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
                    githubUsername={user.githubUsername}
                    githubAvatarUrl={user.image || ""}
                    onSignOut={handleSignOut}
                    onUserPortal={() => {
                        window.location.href = "/api/polar/customer/portal";
                    }}
                />
                <Button as="a" href="/api/docs" color="purple" weight="light">
                    API Docs
                </Button>
            </Header>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <h2 className="font-bold flex-1">Balance</h2>
                    <div className="flex gap-3">
                        <Button as="button" color="pink" weight="light" disabled>+ $10</Button>
                        <Button as="button" color="blue" weight="light" disabled>+ $25</Button>
                        <Button as="button" color="red" weight="light" disabled>+ $50</Button>
                    </div>
                </div>
                <PollenBalance balance={balance} />
            </div>
            {tierData && (
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                        <h2 className="font-bold flex-1">Tier</h2>
                        {tierData.status !== "none" && (
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleActivateTier}
                                    disabled={isActivating}
                                    color="green"
                                    weight="light"
                                >
                                    {isActivating ? "Activating..." : "Activate Tier"}
                                </Button>
                            </div>
                        )}
                    </div>
                    <TierPanel
                        status={tierData.status}
                        next_refill_at_utc={tierData.next_refill_at_utc}
                    />
                </div>
            )}
            <ApiKeyList
                apiKeys={apiKeys}
                onCreate={handleCreateApiKey}
                onDelete={handleDeleteApiKey}
            />
            <FAQ />
        </div>
    );
}
