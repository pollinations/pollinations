/**
 * x402 pay-per-call routes.
 *
 * An isolated payment rail: agents pay in USDC per request instead of holding a
 * Pollinations account and Pollen balance. Existing `/v1/*` auth is untouched.
 *
 * Two schemes are advertised on every route:
 *   - `exact` — flat ceiling price, no buyer setup. First-touch agents use this.
 *   - `upto`  — buyer signs the ceiling; only this scheme can settle below the
 *               signed amount. Needs a one-time Permit2 approval by the buyer.
 *
 * The ceiling runs through `calculatePrice…`, the same engine that prices
 * Pollen, so this rail cannot drift from Pollen rates. Pollen is
 * USD-denominated ($1 ≈ 1 Pollen), so `totalPrice` is already USD.
 *
 * ⚠️ METERED SETTLEMENT IS NOT ACTIVE YET. `@x402/core` reads a settlement
 * override from `transportContext.responseHeaders`, but neither Weft middleware
 * adapter passes `transportContext` to `processSettlement` — both call it with
 * two arguments. Until that is fixed upstream, an `upto` payment settles the
 * full advertised ceiling, exactly like `exact`. The override header below is
 * written in preparation and is currently inert; do not describe this rail as
 * "pay only for what you used" until settlement is verified on a testnet.
 */

import { validator } from "@shared/middleware/validator.ts";
import {
    calculatePriceForModelDefinition,
    type Usage,
} from "@shared/registry/registry.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { weftPaymentMiddlewareHono } from "@weft-labs/sdk/facilitator/middleware";
import {
    type HTTPRequestContext,
    SETTLEMENT_OVERRIDES_HEADER,
} from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { UptoEvmScheme } from "@x402/evm/upto/server";
import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "@/env.ts";
import { resolveModel } from "@/middleware/model.ts";
import { track } from "@/middleware/track.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    generateChatCompletion,
    textBodyLimit,
} from "./generation-handlers.ts";

const DEFAULT_FACILITATOR_URL = "https://x402.weft.network";
const DEFAULT_NETWORK = "eip155:84532"; // Base Sepolia

/**
 * Cost floor. Below this the on-chain settlement fee dominates the payment, so
 * a request metering cheaper is still charged this much.
 *
 * ponytail: flat floor; make it per-network if mainnet gas diverges from testnet.
 */
const MIN_CHARGE_USD = 0.001;

/** Characters per token. Only used for the pre-generation ceiling estimate. */
const CHARS_PER_TOKEN = 4;

/** Headroom on the estimated prompt size so the ceiling is not undershot. */
const PROMPT_ESTIMATE_MARGIN = 1.5;

/** Ceiling assumed when a request does not cap its own output. */
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const ROUTE = "/x402/v1/chat/completions";

function estimatePromptTokens(body: unknown): number {
    const messages = (body as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return 0;
    let chars = 0;
    for (const message of messages) {
        const content = (message as { content?: unknown })?.content;
        if (typeof content === "string") {
            chars += content.length;
        } else if (Array.isArray(content)) {
            // Multimodal parts: only text is estimated here. Image parts are
            // priced from the real usage numbers at settlement time.
            for (const part of content) {
                const text = (part as { text?: unknown })?.text;
                if (typeof text === "string") chars += text.length;
            }
        }
    }
    return Math.ceil((chars / CHARS_PER_TOKEN) * PROMPT_ESTIMATE_MARGIN);
}

/** x402 money strings carry at most 6 decimals (USDC atomic precision). */
function usdPrice(amount: number): string {
    return `$${Math.max(amount, MIN_CHARGE_USD).toFixed(6)}`;
}

/**
 * Worst case for a request: the estimated prompt at the prompt rate plus the
 * caller's own output cap at the completion rate. This is what the buyer signs.
 * An `upto` payer is only charged the metered actual.
 */
async function ceilingPrice(
    env: CloudflareBindings,
    body: unknown,
): Promise<string> {
    const requested = (body as { model?: unknown })?.model;
    if (typeof requested !== "string") return usdPrice(MIN_CHARGE_USD);

    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(requested);
    if (!entry) return usdPrice(MIN_CHARGE_USD);

    const usage: Usage = {
        promptTextTokens: estimatePromptTokens(body),
        completionTextTokens:
            Number((body as { max_tokens?: unknown })?.max_tokens) ||
            DEFAULT_MAX_OUTPUT_TOKENS,
    };

    const { totalPrice } = calculatePriceForModelDefinition(
        entry.id,
        usage,
        entry.definition,
    );
    return usdPrice(totalPrice);
}

/**
 * Bindings only exist per-request in Workers, but the payment middleware does a
 * facilitator handshake at construction. Build the sub-app once and reuse it
 * while the config is unchanged, mirroring the model registry's binding cache.
 */
let cached: { key: string; app: Hono<Env> } | null = null;

export const x402Routes = new Hono<Env>().all("/x402/*", (c) => {
    const key = [
        c.env.WEFT_PAY_TO,
        c.env.WEFT_NETWORK,
        c.env.WEFT_FACILITATOR_URL,
        c.env.WEFT_SELLER_API_KEY ? "keyed" : "anon",
    ].join("|");
    if (!cached || cached.key !== key) {
        cached = { key, app: createX402Routes(c.env) };
    }
    return cached.app.fetch(c.req.raw, c.env, c.executionCtx);
});

export function createX402Routes(env: CloudflareBindings) {
    const app = new Hono<Env>();

    const payTo = env.WEFT_PAY_TO;
    // Without a settlement address there is nobody to pay, so the rail stays
    // closed rather than advertising a challenge it cannot honour.
    if (!payTo) return app;

    const configured = env.WEFT_NETWORK || DEFAULT_NETWORK;
    // x402 networks are CAIP-2 (`eip155:8453`). A malformed value would only
    // surface as a facilitator rejection mid-payment, so reject it at boot.
    if (!/^[^:]+:[^:]+$/.test(configured)) {
        throw new Error(
            `WEFT_NETWORK must be CAIP-2 (e.g. eip155:8453), got: ${configured}`,
        );
    }
    const network = configured as `${string}:${string}`;

    // The Hono adapter's getBody() is async (it awaits `c.req.json()`), unlike
    // the express one. Awaiting is required or the body arrives as a Promise
    // and every request silently prices at the floor.
    const price = async (context: HTTPRequestContext) =>
        ceilingPrice(env, await context.adapter.getBody?.());

    // The SDK declares its own structural `HonoContext` rather than importing
    // Hono's, and it is narrower than the real one (`html()` there returns
    // `Response`, here `Response | Promise<Response>`). The value is an ordinary
    // `(c, next)` Hono middleware at runtime, so bridge the nominal gap here.
    const paymentMiddleware = weftPaymentMiddlewareHono as unknown as (
        routes: Parameters<typeof weftPaymentMiddlewareHono>[0],
        config: Parameters<typeof weftPaymentMiddlewareHono>[1],
    ) => MiddlewareHandler<Env>;

    app.use(
        ROUTE,
        paymentMiddleware(
            {
                [`POST ${ROUTE}`]: {
                    accepts: [
                        { scheme: "upto", network, payTo, price },
                        { scheme: "exact", network, payTo, price },
                    ],
                    description:
                        "OpenAI-compatible chat completions, priced per token.",
                },
            },
            {
                apiKey: env.WEFT_SELLER_API_KEY,
                facilitator: {
                    url: env.WEFT_FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
                },
                name: "Pollinations Text Generation",
                type: "api",
                tags: ["ai", "llm", "inference"],
                schemes: [
                    { network, server: new UptoEvmScheme() },
                    { network, server: new ExactEvmScheme() },
                ],
            },
        ),
    );

    // Writes what the request actually consumed, for the facilitator to settle
    // instead of the advertised ceiling.
    //
    // INERT TODAY — see the ⚠️ note in the module header. The Weft middleware
    // calls `processSettlement(payload, requirements)` without the
    // `transportContext` that carries these response headers, so nothing reads
    // this. Kept because it is the correct shape and starts working the moment
    // the adapter forwards the context; the assertion that it is actually
    // honoured belongs in a testnet settlement test, not a unit test.
    app.use(ROUTE, async (c, next) => {
        await next();
        const definition = c.var.model?.definition;
        if (!definition) return;
        const usage = parseUsageHeaders(c.res.headers);
        const { totalPrice } = calculatePriceForModelDefinition(
            c.var.model.resolved,
            usage,
            definition,
        );
        c.header(
            SETTLEMENT_OVERRIDES_HEADER,
            JSON.stringify({ amount: usdPrice(totalPrice) }),
        );
    });

    app.post(
        ROUTE,
        textBodyLimit,
        validator("json", CreateChatCompletionRequestSchema),
        resolveModel("generate.text"),
        track("generate.text"),
        generateChatCompletion,
    );

    return app;
}
