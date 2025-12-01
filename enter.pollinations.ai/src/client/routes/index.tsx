import {
    createFileRoute,
    redirect,
    useRouter,
    Link,
} from "@tanstack/react-router";
import { hc } from "hono/client";
import { useState, useEffect } from "react";
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
import {
    useAccount,
    useConnect,
    useDisconnect,
    useChainId,
    useSwitchChain,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";

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
    const [activationError, setActivationError] = useState<string | null>(null);

    // Payment method toggle: 'card' or 'crypto'
    const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">(
        "card",
    );
    const [cryptoEnabled, setCryptoEnabled] = useState(false);
    const [cryptoPurchasing, setCryptoPurchasing] = useState<string | null>(
        null,
    );
    const [cryptoError, setCryptoError] = useState<string | null>(null);

    // Wagmi hooks for crypto payments
    const { address, isConnected } = useAccount();
    const { connect, connectors, isPending: isConnecting } = useConnect();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();

    const expectedChain = baseSepolia; // Use base for production
    const isWrongChain = isConnected && chainId !== expectedChain.id;

    // Check if crypto payments are enabled
    useEffect(() => {
        fetch("/api/crypto/status")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) =>
                setCryptoEnabled(
                    (data as { enabled?: boolean } | null)?.enabled ?? false,
                ),
            )
            .catch(() => setCryptoEnabled(false));
    }, []);

    const handleCryptoPurchase = async (amount: string) => {
        if (!isConnected) return;
        if (isWrongChain) {
            setCryptoError(`Please switch to ${expectedChain.name}`);
            return;
        }
        setCryptoPurchasing(amount);
        setCryptoError(null);
        try {
            const response = await fetch(`/api/crypto/topup/${amount}`, {
                method: "POST",
                credentials: "include",
            });
            if (response.status === 402) {
                setCryptoError("x402 payment signing coming soon!");
            } else if (!response.ok) {
                setCryptoError("Payment failed");
            }
        } catch {
            setCryptoError("Payment failed");
        } finally {
            setCryptoPurchasing(null);
        }
    };

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
        window.location.href = `/api/polar/checkout/${encodeURIComponent(slug)}?redirect=true`;
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
                <Button
                    as="a"
                    href="/api/docs"
                    className="bg-gray-900 text-white hover:!brightness-90"
                >
                    API Reference
                </Button>
            </Header>
            <div className="flex flex-col gap-3">
                <h2 className="font-bold">Balance</h2>
                <PollenBalance
                    balances={balances}
                    dailyPollen={tierData?.daily_pollen}
                />

                {/* Payment options row */}
                <div className="flex flex-wrap gap-2 items-center">
                    {/* Payment method toggle */}
                    {cryptoEnabled && (
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 mr-2">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod("card")}
                                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                    paymentMethod === "card"
                                        ? "bg-purple-100 text-purple-900"
                                        : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                💳 Card
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentMethod("crypto")}
                                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                    paymentMethod === "crypto"
                                        ? "bg-blue-100 text-blue-900"
                                        : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                            >
                                💎 USDC
                            </button>
                        </div>
                    )}

                    {/* Card payment buttons */}
                    {paymentMethod === "card" && (
                        <>
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
                        </>
                    )}

                    {/* Crypto payment buttons */}
                    {paymentMethod === "crypto" && (
                        <>
                            {!isConnected ? (
                                <>
                                    {connectors.slice(0, 3).map((connector) => (
                                        <Button
                                            key={connector.uid}
                                            as="button"
                                            color="blue"
                                            weight="light"
                                            disabled={isConnecting}
                                            onClick={() =>
                                                connect({ connector })
                                            }
                                        >
                                            {connector.name === "Injected"
                                                ? "Browser"
                                                : connector.name}
                                        </Button>
                                    ))}
                                </>
                            ) : (
                                <>
                                    <span className="text-sm text-gray-600 flex items-center gap-1">
                                        <span className="text-green-500">
                                            ●
                                        </span>
                                        {address?.slice(0, 6)}...
                                        {address?.slice(-4)}
                                    </span>
                                    {isWrongChain ? (
                                        <Button
                                            as="button"
                                            color="purple"
                                            weight="outline"
                                            className="!bg-yellow-50 !text-yellow-800 !border-yellow-300"
                                            onClick={() =>
                                                switchChain({
                                                    chainId: expectedChain.id,
                                                })
                                            }
                                        >
                                            Switch to {expectedChain.name}
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                as="button"
                                                color="blue"
                                                weight="light"
                                                disabled={
                                                    cryptoPurchasing !== null
                                                }
                                                onClick={() =>
                                                    handleCryptoPurchase("5")
                                                }
                                            >
                                                {cryptoPurchasing === "5"
                                                    ? "..."
                                                    : "+ $5"}
                                            </Button>
                                            <Button
                                                as="button"
                                                color="blue"
                                                weight="light"
                                                disabled={
                                                    cryptoPurchasing !== null
                                                }
                                                onClick={() =>
                                                    handleCryptoPurchase("10")
                                                }
                                            >
                                                {cryptoPurchasing === "10"
                                                    ? "..."
                                                    : "+ $10"}
                                            </Button>
                                            <Button
                                                as="button"
                                                color="blue"
                                                weight="light"
                                                disabled={
                                                    cryptoPurchasing !== null
                                                }
                                                onClick={() =>
                                                    handleCryptoPurchase("20")
                                                }
                                            >
                                                {cryptoPurchasing === "20"
                                                    ? "..."
                                                    : "+ $20"}
                                            </Button>
                                            <Button
                                                as="button"
                                                color="blue"
                                                weight="light"
                                                disabled={
                                                    cryptoPurchasing !== null
                                                }
                                                onClick={() =>
                                                    handleCryptoPurchase("50")
                                                }
                                            >
                                                {cryptoPurchasing === "50"
                                                    ? "..."
                                                    : "+ $50"}
                                            </Button>
                                        </>
                                    )}
                                    <Button
                                        as="button"
                                        color="red"
                                        weight="outline"
                                        size="small"
                                        onClick={() => disconnect()}
                                    >
                                        ✕
                                    </Button>
                                </>
                            )}
                        </>
                    )}

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
                {cryptoError && paymentMethod === "crypto" && (
                    <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                            ⚠️ {cryptoError}
                        </p>
                    </div>
                )}
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
                        target_tier={tierData.target_tier}
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
    );
}
