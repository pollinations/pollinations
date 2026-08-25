import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import {
    serviceAuthorization,
    serviceBillingEvent,
} from "@shared/db/service-billing.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import type { ServiceGatewayBinding } from "@shared/schemas/service-billing.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { requestId } from "hono/request-id";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "@/env.ts";
import { authorizeGeneration } from "@/middleware/billing.ts";
import { logger } from "@/middleware/logger.ts";
import { imageCache } from "@/middleware/media-cache.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { track } from "@/middleware/track.ts";
import { enterGateway } from "./gateway.ts";

/**
 * Cache publication against Enter's real gateway: nothing is put in R2
 * before Enter settled, nothing unpaid is ever published, and a lost
 * settlement acknowledgement is re-delivered once without a second charge.
 */

let caller: { key: string; id: string; userId: string };

beforeAll(async () => {
    caller = await createTestApiKey({ user: { tierBalance: 100 } });
});

type SettleInput = Parameters<ServiceGatewayBinding["settle"]>[0];

/** The real gateway, observing each settle before delegating it. */
function observedGateway(
    onSettle: (input: SettleInput, delivery: number) => Promise<void>,
): ServiceGatewayBinding & { settles: number } {
    const gateway = {
        ...enterGateway,
        settles: 0,
        async settle(input: SettleInput) {
            gateway.settles += 1;
            await onSettle(input, gateway.settles);
            return enterGateway.settle(input);
        },
    };
    return gateway;
}

type Options = {
    gateway?: ServiceGatewayBinding;
    handler?: (c: Context<Env>) => Response;
    media?: boolean;
};

const TEXT_HEADERS = {
    "content-type": "application/json",
    "x-model-used": "gpt-5-nano-2025-08-07",
    "x-usage-prompt-text-tokens": "1000",
    "x-usage-completion-text-tokens": "500",
};

function createApp(options: Options = {}) {
    const state = { cacheKey: "", providerCalls: 0, authorizationId: "" };
    const model = options.media ? "flux" : "openai";
    const app = new Hono<Env>();
    app.use("*", requestId());
    app.use("*", logger);
    app.use("*", async (c, next) => {
        const user = { id: caller.userId, tier: "seed" } as never;
        c.set("auth", {
            user,
            apiKey: { id: caller.id, rawKey: caller.key } as never,
            requireUser: () => user,
            requireModelAccess: () => {},
        });
        c.set("balance", {
            getBalance: async () => ({ tierBalance: 100, packBalance: 0 }),
            estimatedPrice: 0.01,
        });
        c.set("model", {
            requested: model,
            resolved: model,
            definition: getRegistryModelDefinition(model),
        });
        await next();
    });
    app.get(
        "/generate/:prompt",
        track(options.media ? "generate.image" : "generate.text"),
        options.media ? imageCache : textCache,
        authorizeGeneration,
        (c) => {
            state.cacheKey = c.var.generationCache?.key ?? "";
            state.authorizationId = c.var.billing?.authorizationId ?? "";
            state.providerCalls += 1;
            if (options.handler) return options.handler(c);
            return new Response(
                JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
                { headers: TEXT_HEADERS },
            );
        },
    );
    const bindings = {
        ...env,
        ENTER_GATEWAY: options.gateway ?? enterGateway,
    } as CloudflareBindings;
    const bucket = options.media ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
    return {
        state,
        bucket,
        async request(prompt: string) {
            const ctx = createExecutionContext();
            const response = await app.fetch(
                new Request(`https://gen.pollinations.ai/generate/${prompt}`),
                bindings,
                ctx,
            );
            // The caller's branch may fail with the source stream.
            await response.arrayBuffer().catch(() => undefined);
            await waitOnExecutionContext(ctx);
            return response;
        },
        async published() {
            return (await bucket.head(state.cacheKey)) !== null;
        },
    };
}

async function ledger(authorizationId: string) {
    const db = drizzle(env.DB);
    return {
        authorization: await db
            .select()
            .from(serviceAuthorization)
            .where(eq(serviceAuthorization.id, authorizationId))
            .get(),
        events: await db
            .select()
            .from(serviceBillingEvent)
            .where(eq(serviceBillingEvent.authorizationId, authorizationId)),
    };
}

describe("generation cache publication", () => {
    it("puts the cache object only after Enter settled", async () => {
        let publishedAtSettle: boolean | undefined;
        const app = createApp({
            gateway: observedGateway(async () => {
                publishedAtSettle = await app.published();
            }),
        });
        const response = await app.request(`settled-${crypto.randomUUID()}`);
        expect(response.status).toBe(200);

        expect(publishedAtSettle).toBe(false);
        expect(await app.published()).toBe(true);
        const { authorization, events } = await ledger(
            app.state.authorizationId,
        );
        expect(events.map((event) => event.eventId)).toEqual(["generation"]);
        expect(authorization?.settledPrice).toBeGreaterThan(0);
    });

    it("never publishes a response whose settlement Enter refused", async () => {
        const app = createApp({
            gateway: observedGateway(async (input) => {
                // The reserve is gone by the time track settles.
                await enterGateway.cancel(input.authorizationId);
            }),
        });
        const prompt = `refused-${crypto.randomUUID()}`;
        const response = await app.request(prompt);
        expect(response.status).toBe(200);

        const { events } = await ledger(app.state.authorizationId);
        expect(events).toHaveLength(0);
        expect(await app.published()).toBe(false);
        // The refusal is final: the provider is not re-run for it.
        expect(app.state.providerCalls).toBe(1);
    });

    it("re-delivers a settlement whose acknowledgement was lost, charging once", async () => {
        const gateway = observedGateway(async (_input, delivery) => {
            if (delivery === 1) {
                // Enter commits, then the acknowledgement is lost in transit.
                await enterGateway.settle(_input);
                throw new Error("acknowledgement lost");
            }
        });
        const app = createApp({ gateway });
        const prompt = `lost-ack-${crypto.randomUUID()}`;
        const first = await app.request(prompt);
        expect(first.status).toBe(200);
        expect(gateway.settles).toBe(2);

        const { events } = await ledger(app.state.authorizationId);
        expect(events.map((event) => event.eventId)).toEqual(["generation"]);
        expect(await app.published()).toBe(true);

        // An identical caller retry is a cache hit: the provider ran once
        // and the ledger still carries exactly one debit.
        const retry = await app.request(prompt);
        expect(retry.status).toBe(200);
        expect(retry.headers.get("x-cache")).toBe("HIT");
        expect(app.state.providerCalls).toBe(1);
        expect(gateway.settles).toBe(2);
    });

    it("cancels the authorization when the media body cannot be cached", async () => {
        const app = createApp({
            media: true,
            handler: () =>
                new Response(new Uint8Array(0), {
                    headers: {
                        "content-type": "image/jpeg",
                        "x-model-used": "flux",
                    },
                }),
        });
        const response = await app.request(`empty-${crypto.randomUUID()}`);
        expect(response.status).toBe(200);

        const { authorization, events } = await ledger(
            app.state.authorizationId,
        );
        expect(events).toHaveLength(0);
        expect(authorization?.canceledAt).not.toBeNull();
        expect(await app.published()).toBe(false);
    });

    it("cancels the authorization when the text source stream errors", async () => {
        const app = createApp({
            handler: () =>
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("{"));
                            controller.error(new Error("upstream reset"));
                        },
                    }),
                    { headers: TEXT_HEADERS },
                ),
        });
        const response = await app.request(`broken-${crypto.randomUUID()}`);
        expect(response.status).toBe(200);

        const { authorization, events } = await ledger(
            app.state.authorizationId,
        );
        expect(events).toHaveLength(0);
        expect(authorization?.canceledAt).not.toBeNull();
        expect(await app.published()).toBe(false);
    });
});
