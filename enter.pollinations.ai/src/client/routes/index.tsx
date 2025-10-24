import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { hc } from "hono/client";
import { useState } from "react";
import type { PolarRoutes } from "../../routes/polar.ts";
import {
    ApiKeyList,
    type CreateApiKey,
    type CreateApiKeyResponse,
} from "../components/api-key.tsx";
import { Button } from "../components/button.tsx";
import { config } from "../config.ts";
import { User } from "../components/user.tsx";
import { PollenBalance } from "../components/pollen-balance.tsx";
import { TierCard } from "../components/tier-card.tsx";
import { FAQ } from "../components/faq.tsx";
import { Header } from "../components/header.tsx";

export const Route = createFileRoute("/")({
    component: RouteComponent,
    loader: async ({ context }) => {
        if (!context.user) throw redirect({ to: "/sign-in" });
        const honoPolar = hc<PolarRoutes>("/api/polar");
        const stateResult = await honoPolar.customer.state.$get();
        const customer = stateResult.ok ? await stateResult.json() : null;
        const apiKeysResult = await context.auth.apiKey.list();
        const apiKeys = apiKeysResult.data ? apiKeysResult.data : [];

        console.log(context.user);
        return { auth: context.auth, user: context.user, customer, apiKeys };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer, apiKeys } = Route.useLoaderData();
    const meter = customer?.activeMeters.filter(
        (meter) => meter.meterId === config.pollenMeterId,
    )[0];
    const balance = meter?.balance || 0;

    const [isSigningOut, setIsSigningOut] = useState(false);

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
        const createKeyDate = {
            name: formState.name,
            metadata: {
                description: formState.description,
            },
        };
        const result = await auth.apiKey.create(createKeyDate);
        if (result.error) {
            // TODO: handle it
            console.error(result.error);
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

    return (
        <div className="flex flex-col gap-20">
            <Header>
                <Button as="a" href="/api/docs" weight="outline">
                    API Docs →
                </Button>
                <User
                    githubUsername={user.githubUsername}
                    githubAvatarUrl={user.image || ""}
                    onSignOut={handleSignOut}
                    onUserPortal={() => {
                        window.location.href = "/api/polar/customer/portal";
                    }}
                />
            </Header>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                    <h2 className="font-bold flex-1">Balance</h2>
                    <div className="flex gap-3">
                        <Button as="a" color="pink" weight="light" href="/api/polar/checkout/pollen-bundle-small" target="_blank">+ $10</Button>
                        <Button as="a" color="blue" weight="light" href="/api/polar/checkout/pollen-bundle-medium" target="_blank">+ $25</Button>
                        <Button as="a" color="red" weight="light" href="/api/polar/checkout/pollen-bundle-large" target="_blank">+ $50</Button>
                    </div>
                </div>
                <PollenBalance balance={balance} />
            </div>
            {(user.tier === "seed" || user.tier === "flower" || user.tier === "nectar") && (
                <div className="flex flex-col gap-2">
                    <h2 className="font-bold">Tier</h2>
                    <TierCard tier={user.tier} />
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
