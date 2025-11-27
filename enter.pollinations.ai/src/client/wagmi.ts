/**
 * Wagmi configuration for wallet connection
 *
 * Supports external wallets (MetaMask, Coinbase Wallet, WalletConnect)
 * for USDC payments on Base network.
 */

import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";

// WalletConnect Project ID - get yours at https://cloud.reown.com/
// For production, this should be set via environment variable
const WALLETCONNECT_PROJECT_ID = "pollinations-x402";

export const wagmiConfig = createConfig({
    chains: [base, baseSepolia],
    connectors: [
        // Browser extension wallets (MetaMask, etc.)
        injected(),
        // Coinbase Wallet
        coinbaseWallet({
            appName: "Pollinations.AI",
            appLogoUrl: "https://pollinations.ai/favicon.ico",
        }),
        // WalletConnect (mobile wallets)
        walletConnect({
            projectId: WALLETCONNECT_PROJECT_ID,
            metadata: {
                name: "Pollinations.AI",
                description: "Buy pollen with USDC on Base",
                url: "https://enter.pollinations.ai",
                icons: ["https://pollinations.ai/favicon.ico"],
            },
        }),
    ],
    transports: {
        [base.id]: http(),
        [baseSepolia.id]: http(),
    },
});

// Export chain IDs for use in components
export const SUPPORTED_CHAINS = {
    mainnet: base,
    testnet: baseSepolia,
} as const;

// USDC contract addresses on Base
export const USDC_ADDRESSES = {
    [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
    [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
};
