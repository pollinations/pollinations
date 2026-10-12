import { weftPaymentMiddlewareHono } from "@weftlabs/sdk/facilitator/middleware";
import { findDefaultAsset } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { Hono } from "hono";
import art from "../../../shared/assets/weft-paywall.webp";
import { createWeftPaywall } from "../../../shared/weft-paywall.js";
import { expressPage, VM_CORS } from "./origin.ts";

// The $0.01 x402 paywall of the VM's image.pollinations.ai/src/weftX402.ts,
// for GET requests outside the free limit. origin.ts loads this module only
// then.

// The VM's payment challenges name its origin host and the /prompt path,
// without the caller's host or query (which can hold a token)
const RESOURCE_ORIGIN = "https://image-origin.pollinations.ai";
// The User-Agent the facilitator saw from the VM: the Express middleware's on
// /supported, Node 22 fetch's default on /verify and /settle
const SUPPORTED_HEADERS = { "User-Agent": "weft-sdk-express/0.27.1" };
const PAYMENT_HEADERS = { "User-Agent": "node" };
// Statuses the payment middleware answers itself: the challenge, a failed
// verify or settlement, and an unavailable facilitator
const PAYWALL_STATUSES = [402, 412, 503];

type Bindings = { generate: () => Promise<Response> };
let app: Hono<{ Bindings: Bindings }> | undefined;

/** The middleware fetches /supported when built, so build it inside a request */
function paywallApp(env: Record<string, any>) {
    const paywall = weftPaymentMiddlewareHono(
        {
            "GET *": {
                accepts: {
                    scheme: "exact",
                    network: env.WEFT_NETWORK,
                    payTo: env.WEFT_PAY_TO,
                    price: "$0.01",
                },
                description: "Generate one image with Pollinations",
            },
        },
        {
            apiKey: env.WEFT_SELLER_API_KEY,
            facilitator: {
                url: env.WEFT_FACILITATOR_URL,
                createAuthHeaders: () => ({
                    supported: SUPPORTED_HEADERS,
                    verify: PAYMENT_HEADERS,
                    settle: PAYMENT_HEADERS,
                }),
            },
            name: "Pollinations legacy image",
            type: "api",
            tags: ["image"],
            paywall: createWeftPaywall(
                "image",
                findDefaultAsset,
                Buffer.from(art).toString("base64"),
            ),
            schemes: [
                { network: env.WEFT_NETWORK, server: new ExactEvmScheme() },
            ],
        },
    );
    return (
        new Hono<{ Bindings: Bindings }>()
            .use(paywall)
            .all("*", (c) => c.env.generate())
            // A facilitator exception (no /supported yet, a malformed reply, a
            // timeout) reached Express's default error handler
            .onError((error) => expressError(error))
    );
}

/** finalhandler for an error, with NODE_ENV=production: the status message */
async function expressError(error: Error & Record<string, any>) {
    const status =
        [error.status, error.statusCode].find(
            (code) => typeof code === "number" && code >= 400 && code < 600,
        ) ?? 500;
    // Loaded here so that cold starts serving cache hits skip it
    const { STATUS_CODES } = await import("node:http");
    return expressPage(status, STATUS_CODES[status] ?? String(status));
}

/**
 * Answers a GET outside the free limit: the 402 challenge, or with a payment,
 * verify, generate() and settle.
 * @param generate an unpaid generation
 */
export async function pay(
    request: Request,
    pathname: string,
    env: Record<string, any>,
    ctx: ExecutionContext,
    generate: () => Promise<Response>,
) {
    app ??= paywallApp(env);
    const paid = app.fetch(
        new Request(RESOURCE_ORIGIN + pathname, {
            method: request.method,
            headers: request.headers,
        }),
        { generate },
    );
    // A buyer who disconnects still gets the generation and pays, as on the VM
    ctx.waitUntil(paid);
    return expressHeaders(await paid);
}

/** Express's weak ETag: body length in hex and the start of its base64 SHA-1 */
async function etag(bytes: ArrayBuffer) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
    const base64 = btoa(String.fromCharCode(...hash));
    return `W/"${bytes.byteLength.toString(16)}-${base64.slice(0, 27)}"`;
}

/**
 * Express wrote the payment middleware's own responses: its Content-Type
 * strings, weak ETag on JSON and X-Powered-By, after the VM's CORS headers.
 * Generated responses and error pages already have them.
 */
async function expressHeaders(response: Response) {
    if (!PAYWALL_STATUSES.includes(response.status)) return response;
    const headers = new Headers(response.headers);
    const body = await response.arrayBuffer();
    const type = headers.get("content-type") ?? "";
    if (/^text\/html/i.test(type)) {
        headers.set("Content-Type", "text/html; charset=utf-8");
    }
    if (/^application\/json/i.test(type)) {
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("ETag", await etag(body));
        headers.set("Content-Length", String(body.byteLength));
    }
    headers.set("X-Powered-By", "Express");
    for (const [name, value] of Object.entries(VM_CORS))
        headers.set(name, value);
    return new Response(body, { status: response.status, headers });
}
