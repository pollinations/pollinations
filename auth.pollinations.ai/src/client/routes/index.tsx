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
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: RouteComponent,
    loader: async ({ context }) => {
        if (!context.user) throw redirect({ to: "/sign-in" });
        const honoPolar = hc<PolarRoutes>("/api/polar");
        const stateResult = await honoPolar.customer.state.$get();
        const customer = stateResult.ok ? await stateResult.json() : null;

        const apiKeysResult = await context.auth.apiKey.list();
        const apiKeys = apiKeysResult.data ? apiKeysResult.data : [];

        return { auth: context.auth, user: context.user, customer, apiKeys };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer, apiKeys } = Route.useLoaderData();
    const meter = customer?.activeMeters.filter(
        (meter) => meter.meterId === "776f38e7-d0a1-434f-90ef-6f31d66639d9",
    )[0];
    const balance = meter?.balance || 0;

    const [isSigningOut, setIsSigningOut] = useState(false);

    const handleSignOut = async () => {
        if (isSigningOut) return; // Prevent double-clicks
        setIsSigningOut(true);
        try {
            await auth.signOut();
            await router.invalidate();
            router.clearExpiredCache();
        } catch (error) {
            console.error("Sign out failed:", error);
        } finally {
            setIsSigningOut(false);
        }
    };

    const handleCreateApiKey = async (formState: CreateApiKey) => {
        const createKeyDate = {
            name: formState.name,
            description: formState.description,
            metadata: {
                domains: formState.domains,
            },
        };
        const result = await auth.apiKey.create(createKeyDate);
        if (result.error) {
            // TODO: handle it
            console.error(result.error);
        }
        console.log(result.data);
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
            <div className="flex justify-between">
                <h1>Pollinations</h1>
                <Button
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    variant="pink"
                >
                    {isSigningOut ? "Signing out..." : "Sign Out"}
                </Button>
            </div>
            <div className="flex flex-col gap-2">
                <h2 className="font-bold">User</h2>
                <ul>
                    <li>Name: {user.name}</li>
                    <li>E-Mail: {user.email}</li>
                </ul>
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex justify-between gap-3">
                    <h2 className="font-bold flex-1">Pollen</h2>
                    <span className="text-3xl font-heading">Buy</span>
                    <Link to="/imprint" />
                    <Button
                        as={"a"}
                        variant="pink"
                        href="/api/polar/checkout/pollen-bundle-small"
                        target="_blank"
                    >
                        10 $
                    </Button>
                    <Button
                        as="a"
                        variant="blue"
                        href="/api/polar/checkout/pollen-bundle-medium"
                        target="_blank"
                    >
                        25 $
                    </Button>
                    <Button
                        as="a"
                        variant="red"
                        href="/api/polar/checkout/pollen-bundle-large"
                        target="_blank"
                    >
                        50 $
                    </Button>
                </div>
                <Button as="a" href="/api/polar/customer/portal">
                    Portal
                </Button>

                <p className="text-3xl">Balance: {balance.toFixed(2)}</p>
            </div>
            <ApiKeyList
                apiKeys={apiKeys}
                onCreate={handleCreateApiKey}
                onDelete={handleDeleteApiKey}
            />
        </div>
    );
}
