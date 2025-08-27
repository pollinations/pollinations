import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { hc } from "hono/client";
import { useState } from "react";
import type { PolarRoutes } from "../../routes/polar.ts";

export const Route = createFileRoute("/")({
    component: RouteComponent,
    loader: async ({ context }) => {
        if (!context.user) throw redirect({ to: "/sign-in" });
        const honoPolar = hc<PolarRoutes>("/api/polar");
        const result = await honoPolar.customer.state.$get();
        const customer = result.ok ? await result.json() : null;
        return { auth: context.auth, user: context.user, customer };
    },
});

function RouteComponent() {
    const router = useRouter();
    const { auth, user, customer } = Route.useLoaderData();
    const balance = customer?.activeMeters[0]?.balance;

    const [isSigningOut, setIsSigningOut] = useState(false);

    const handleSignOut = async () => {
        if (isSigningOut) return; // Prevent double-clicks

        setIsSigningOut(true);
        try {
            await auth.signOut();
        } catch (error) {
            console.error("Sign out failed:", error);
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 max-w-[400px]">
                <h5 className="text-xl font-bold">User</h5>
                <ul>
                    <li>Name: {user.name}</li>
                    <li>E-Mail: {user.email}</li>
                </ul>
                <button
                    type="button"
                    className="bg-blue-500 hover:bg-blue text-white font-bold px-2 py-1"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                >
                    {isSigningOut ? "Signing out..." : "Sign Out"}
                </button>
            </div>
            <h5 className="text-xl font-bold">Pollen</h5>
            <ul>
                {balance && <li>Balance: {balance.toFixed(2)}</li>}
                <li style={{ display: "flex", gap: "0.5rem" }}>
                    Buy Pollen-Bundle:
                    <a href="/api/polar/checkout/pollen-bundle-small">Small</a>
                    <a href="/api/polar/checkout/pollen-bundle-medium">
                        Medium
                    </a>
                    <a href="/api/polar/checkout/pollen-bundle-large">Large</a>
                </li>
            </ul>
        </div>
    );
}
