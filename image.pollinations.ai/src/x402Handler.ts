import type { IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import { paymentMiddleware, type Network } from "x402-express";
import debug from "debug";

const log = debug("pollinations:x402");

const payTo = process.env.X402_PAY_TO as `0x${string}` | undefined;
const network = (process.env.X402_NETWORK as Network | undefined) ?? "base-sepolia";
const price = process.env.X402_PRICE ?? "$0.0001";

let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

if (!payTo) {
    log("X402_PAY_TO not set; /paid/prompt disabled");
} else {
    const app = express();
    app.use(
        paymentMiddleware(payTo, {
            "GET /paid/prompt/*": {
                price,
                network,
                config: {
                    description: "Pollinations legacy image (Sana) — pay-per-call",
                    mimeType: "image/jpeg",
                },
            },
        }),
    );
    app.get("/paid/prompt/*", (req, res) => {
        // After successful payment, hand back to the legacy generator by
        // rewriting the path to /prompt/* and invoking the original handler.
        const rest = req.path.replace(/^\/paid\/prompt\//, "/prompt/");
        const search = req.url.includes("?")
            ? req.url.slice(req.url.indexOf("?"))
            : "";
        req.url = `${rest}${search}`;
        legacyHandler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    });
    handler = (req, res) => app(req as any, res as any);
    log(`x402 enabled: payTo=${payTo} network=${network} price=${price}`);
}

let legacyHandler: (req: IncomingMessage, res: ServerResponse) => void = () => {};

export function attachLegacyHandler(h: (req: IncomingMessage, res: ServerResponse) => void) {
    legacyHandler = h;
}

export function x402Enabled(): boolean {
    return handler !== null;
}

export function handleX402(req: IncomingMessage, res: ServerResponse): void {
    if (!handler) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "x402 not configured on this host" }));
        return;
    }
    handler(req, res);
}
