import { Context, MiddlewareHandler, Next } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme as registerServerEvmScheme } from "@x402/evm/exact/server";
import type { Env } from "../env.ts";

// USDC on Base Mainnet
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN_ID = "eip155:8453"; // Base Mainnet

// Map amounts to prices
const PACKS = {
    "5": { price: "$5.00", amount: 5 },
    "10": { price: "$10.00", amount: 10 },
    "20": { price: "$20.00", amount: 20 },
    "50": { price: "$50.00", amount: 50 },
} as const;

export const createX402Middleware = (env: Env["Bindings"]): MiddlewareHandler => {
    const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
    });

    const resourceServer = new x402ResourceServer(facilitatorClient);
    registerServerEvmScheme(resourceServer);

    // Build configuration for each pack
    const config: Record<string, any> = {};
    
    // We must use the receiving address from environment
    const recipientAddress = env.X402_SERVER_ADDRESS as `0x${string}`;

    if (!recipientAddress) {
        console.warn("X402_SERVER_ADDRESS not set, x402 middleware disabled");
        return async (c, next) => await next();
    }

    Object.entries(PACKS).forEach(([key, pack]) => {
        // The path must match exactly what Hono sees
        // We will mount this on /api/crypto/topup, so the path in middleware config
        // should be relative to the mounting point? No, usually it's the full path.
        // But Hono middleware can be tricky. Let's assume full path.
        config[`POST /api/crypto/topup/${key}`] = {
            accepts: [
                {
                    scheme: "exact",
                    price: pack.price,
                    network: CHAIN_ID,
                    payTo: recipientAddress,
                    token: USDC_ADDRESS, // Specify USDC token
                },
            ],
            description: `Top up ${pack.amount} Pollen ($${pack.amount} USDC)`,
            mimeType: "application/json",
        };
    });

    return paymentMiddleware(config, resourceServer);
};
