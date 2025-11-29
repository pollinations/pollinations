/**
 * CryptoPayment Component
 *
 * Allows users to connect their external wallet and purchase pollen
 * using USDC on Base network via the x402 protocol.
 */

import { useState, useEffect } from "react";
import {
    useAccount,
    useConnect,
    useDisconnect,
    useChainId,
    useSwitchChain,
} from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { Button } from "./button.tsx";

const CRYPTO_PACKS = [
    { amount: "5", pollen: 5000, label: "$5" },
    { amount: "10", pollen: 10000, label: "$10" },
    { amount: "20", pollen: 20000, label: "$20" },
    { amount: "50", pollen: 50000, label: "$50" },
] as const;

type CryptoStatus = {
    enabled: boolean;
    network: string;
    walletAddress: string;
};

export function CryptoPayment() {
    const { address, isConnected } = useAccount();
    const { connect, connectors, isPending: isConnecting } = useConnect();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();

    const [cryptoStatus, setCryptoStatus] = useState<CryptoStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const expectedChain = cryptoStatus?.network === "base" ? base : baseSepolia;
    const isWrongChain = isConnected && chainId !== expectedChain.id;

    useEffect(() => {
        async function checkCryptoStatus() {
            try {
                const response = await fetch("/api/crypto/status");
                if (response.ok) {
                    const data = (await response.json()) as CryptoStatus;
                    setCryptoStatus(data);
                } else {
                    setCryptoStatus({
                        enabled: false,
                        network: "",
                        walletAddress: "",
                    });
                }
            } catch {
                setCryptoStatus({
                    enabled: false,
                    network: "",
                    walletAddress: "",
                });
            } finally {
                setIsLoading(false);
            }
        }
        checkCryptoStatus();
    }, []);

    const handlePurchase = async (amount: string) => {
        if (!isConnected || !address) {
            setError("Please connect your wallet first");
            return;
        }

        if (isWrongChain) {
            setError(`Please switch to ${expectedChain.name}`);
            return;
        }

        setIsPurchasing(amount);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/crypto/topup/${amount}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
            });

            if (response.status === 402) {
                const paymentReq = (await response.json()) as {
                    paymentRequirements?: { price?: string }[];
                };
                setError(
                    `Payment of ${paymentReq.paymentRequirements?.[0]?.price || `$${amount}`} USDC required. ` +
                        "x402 payment signing coming soon!",
                );
                return;
            }

            if (!response.ok) {
                const errorData = (await response.json().catch(() => ({}))) as {
                    message?: string;
                };
                throw new Error(errorData.message || "Payment failed");
            }

            const result = (await response.json()) as {
                pollen_credited: number;
            };
            setSuccess(
                `Successfully purchased ${result.pollen_credited.toLocaleString()} pollen!`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Payment failed");
        } finally {
            setIsPurchasing(null);
        }
    };

    if (isLoading) {
        return (
            <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-500">
                    Checking crypto payment availability...
                </p>
            </div>
        );
    }

    if (!cryptoStatus?.enabled) {
        return null;
    }

    return (
        <div className="flex flex-col gap-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">💎</span>
                    <span className="font-semibold text-gray-900">
                        Pay with Crypto
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        USDC
                    </span>
                </div>
                <span className="text-xs text-gray-500">0% fees</span>
            </div>

            {!isConnected ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-600">Connect:</span>
                    {connectors.map((connector) => {
                        const displayName =
                            connector.name === "Injected"
                                ? "Browser Wallet"
                                : connector.name;
                        return (
                            <Button
                                key={connector.uid}
                                as="button"
                                color="blue"
                                weight="outline"
                                size="small"
                                disabled={isConnecting}
                                onClick={() => connect({ connector })}
                            >
                                {displayName}
                            </Button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-green-500">●</span>
                            <span className="text-sm font-mono text-gray-700">
                                {address?.slice(0, 6)}...{address?.slice(-4)}
                            </span>
                        </div>
                        <Button
                            as="button"
                            color="red"
                            weight="outline"
                            size="small"
                            onClick={() => disconnect()}
                        >
                            Disconnect
                        </Button>
                    </div>

                    {isWrongChain && (
                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-800">
                                Please switch to {expectedChain.name}
                                <Button
                                    as="button"
                                    color="purple"
                                    weight="light"
                                    size="small"
                                    className="ml-2"
                                    onClick={() =>
                                        switchChain({
                                            chainId: expectedChain.id,
                                        })
                                    }
                                >
                                    Switch Network
                                </Button>
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {CRYPTO_PACKS.map((pack) => (
                            <Button
                                key={pack.amount}
                                as="button"
                                color="blue"
                                weight="light"
                                disabled={isPurchasing !== null || isWrongChain}
                                onClick={() => handlePurchase(pack.amount)}
                            >
                                {isPurchasing === pack.amount
                                    ? "Processing..."
                                    : `${pack.label} USDC`}
                            </Button>
                        ))}
                    </div>

                    {error && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-800">{error}</p>
                        </div>
                    )}
                    {success && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded">
                            <p className="text-sm text-green-800">{success}</p>
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-gray-400">
                <a
                    href="https://x402.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-600"
                >
                    x402
                </a>{" "}
                • Base network • ~2s settlement
            </p>
        </div>
    );
}
