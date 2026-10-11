import { weftPaymentMiddlewareHono } from "@weftlabs/sdk/facilitator/middleware";
import { findDefaultAsset } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { Hono } from "hono";
import art from "../../../shared/assets/weft-paywall.webp";
import { createWeftPaywall } from "../../../shared/weft-paywall.js";
import { CORS, etag } from "./origin.js";

// The $0.01 x402 paywall of the VM's text.pollinations.ai/weftX402.js, for
// requests outside the free limit. origin.js loads this module only then.

// The VM's payment challenges name its origin host and the path, without the
// caller's host or query (which can hold a token)
const RESOURCE_ORIGIN = "https://text-origin.pollinations.ai";
// The seller identity the facilitator saw from the VM's Express middleware
const SELLER_HEADERS = { "User-Agent": "weft-sdk-express/0.27.1" };

let app;

/** The middleware fetches /supported when built, so build it inside a request */
function paywallApp(env) {
    const route = () => ({
        accepts: {
            scheme: "exact",
            network: env.WEFT_NETWORK,
            payTo: env.WEFT_PAY_TO,
            price: "$0.01",
        },
        description: "Generate one text response with Pollinations",
    });
    const paywall = weftPaymentMiddlewareHono(
        { "GET *": route(), "POST *": route() },
        {
            apiKey: env.WEFT_SELLER_API_KEY,
            facilitator: {
                url: env.WEFT_FACILITATOR_URL,
                createAuthHeaders: () => ({
                    supported: SELLER_HEADERS,
                    verify: SELLER_HEADERS,
                    settle: SELLER_HEADERS,
                }),
            },
            name: "Pollinations legacy text",
            type: "api",
            tags: ["text"],
            paywall: createWeftPaywall(
                "response",
                findDefaultAsset,
                Buffer.from(art).toString("base64"),
            ),
            schemes: [
                { network: env.WEFT_NETWORK, server: new ExactEvmScheme() },
            ],
        },
    );
    return (
        new Hono()
            .use(paywall)
            .all("*", (c) => c.env.generate())
            // A facilitator exception (no /supported yet, a malformed reply, a
            // timeout) gets an unpaid generation: the VM's callback ignored next(err)
            .onError((_error, c) => c.env.generate())
    );
}

/**
 * Answers a request outside the free limit: the 402 challenge, or with a
 * payment, verify, generate() and settle.
 * @param {() => Promise<Response>} generate an unpaid generation
 */
export async function pay(request, env, ctx, generate) {
    app ??= paywallApp(env);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const { pathname } = new URL(request.url);
    const paid = app.fetch(
        new Request(RESOURCE_ORIGIN + pathname, {
            method: request.method,
            headers,
        }),
        { generate },
    );
    // A buyer who disconnects still gets the generation and pays, as on the VM
    ctx.waitUntil(paid);
    return expressHeaders(await paid);
}

/**
 * The VM's Express wrote the paywall's own responses: its Content-Type
 * strings, weak ETag on JSON and X-Powered-By, after the CORS middleware.
 * Generated responses already have them.
 */
async function expressHeaders(response) {
    if (response.ok) return response;
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
    for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
    return new Response(body, { status: response.status, headers });
}
