import type { IncomingMessage, ServerResponse } from "node:http";
import { weftPaymentMiddleware } from "@weftlabs/sdk/facilitator/middleware";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import express from "express";

let paymentMiddleware: ReturnType<typeof weftPaymentMiddleware> | undefined;

export function weftImageEnabled(): boolean {
    return Boolean(process.env.WEFT_SELLER_API_KEY && process.env.WEFT_PAY_TO &&
        process.env.WEFT_NETWORK && process.env.WEFT_FACILITATOR_URL);
}

export function requireImagePayment(
    req: IncomingMessage,
    res: ServerResponse,
    onPaid: () => Promise<void>,
): void {
    const { WEFT_SELLER_API_KEY, WEFT_PAY_TO, WEFT_NETWORK, WEFT_FACILITATOR_URL } = process.env;
    if (!WEFT_SELLER_API_KEY || !WEFT_PAY_TO || !WEFT_NETWORK || !WEFT_FACILITATOR_URL) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "x402 payments are not configured" }));
        return;
    }
    const network = WEFT_NETWORK as `${string}:${string}`;

    paymentMiddleware ??= weftPaymentMiddleware(
        {
            "GET *": {
                accepts: {
                    scheme: "exact",
                    network,
                    payTo: WEFT_PAY_TO,
                    price: "$0.01",
                },
                description: "Generate one image with Pollinations",
            },
        },
        {
            apiKey: WEFT_SELLER_API_KEY,
            facilitator: { url: WEFT_FACILITATOR_URL },
            name: "Pollinations legacy image",
            type: "api",
            tags: ["image"],
            schemes: [{ network, server: new ExactEvmScheme() }],
        },
    );

    // Express supplies the request adapter needed by the Weft middleware;
    // the existing Node image handler still owns generation and its response.
    const app = express();
    app.set("trust proxy", true);
    app.get("*", paymentMiddleware, (_req, _res, next) => {
        onPaid().catch(next);
    });
    app(req, res);
}
