import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import assert from "node:assert/strict";
import type { Logger } from "@logtape/logtape";
import {
    signAgentRunToken,
    verifyAgentRunToken,
} from "@shared/auth/agent-run-token.ts";
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { expect } from "vitest";
import type { Env } from "@/env.ts";
import { auth, authFromSnapshot } from "@/middleware/auth.ts";
import { imageCache } from "@/middleware/media-cache.ts";
import { resolveModel } from "@/middleware/model.ts";
import { textCache } from "@/middleware/text-cache.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import { getGenerationModelRegistry } from "../src/model-registry.ts";

const log = {
    getChild: () => log,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as Logger;

async function tokenFor(id: string, pollen?: "quest") {
    return signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: id,
        parentRequestId: "quest-test",
        pollen,
    });
}

function resolutionApp(
    eventType: "generate.text" | "generate.image" = "generate.text",
) {
    return new Hono<Env>()
        .use("*", auth())
        .use("*", resolveModel(eventType))
        .all("*", (c) =>
            c.json({
                model: c.var.model.resolved,
                pollen: c.var.model.pollen ?? "all",
                fallbacks: c.var.model.fallbackEntries?.map(
                    (entry) => entry.id,
                ),
            }),
        );
}

async function dispatch(
    app: Hono<Env>,
    path: string,
    token: string,
    body?: unknown,
) {
    const ctx = createExecutionContext();
    const response = await app.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
        }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

test("GET and Chat expose the same optional pollen enum", () => {
    for (const pollen of [undefined, "quest", "all"]) {
        expect(
            GenerateTextRequestQueryParamsSchema.parse({ pollen }).pollen,
        ).toBe(pollen);
        expect(
            CreateChatCompletionRequestSchema.parse({ messages: [], pollen })
                .pollen,
        ).toBe(pollen);
    }
    for (const pollen of [null, "free", "paid", true, {}, []]) {
        expect(
            GenerateTextRequestQueryParamsSchema.safeParse({ pollen }).success,
        ).toBe(false);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages: [],
                pollen,
            }).success,
        ).toBe(false);
    }
});

test("signed Quest claims survive authentication and malformed signed policies fail closed", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const restricted = await tokenFor(parent.id, "quest");
    expect(
        await verifyAgentRunToken(restricted, env.BETTER_AUTH_SECRET),
    ).toMatchObject({ pollen: "quest" });
    expect(
        await verifyAgentRunToken(
            await tokenFor(parent.id),
            env.BETTER_AUTH_SECRET,
        ),
    ).not.toHaveProperty("pollen");
    const registry = await getGenerationModelRegistry(env);
    const eligible = registry
        .visibleEntries()
        .find(
            (entry) =>
                entry.eventType === "generate.text" &&
                !entry.communityEndpoint &&
                entry.definition.paidOnly !== true,
        );
    assert(eligible);
    const response = await dispatch(
        resolutionApp(),
        `/?model=${encodeURIComponent(eligible.id)}&pollen=all`,
        restricted,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pollen: "quest" });
    for (const pollen of ["all", null, true, "free", {}]) {
        const jwt = await new SignJWT({ parentRequestId: "request", pollen })
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setIssuer("gen.pollinations.ai")
            .setAudience("pollinations-api")
            .setSubject(parent.id)
            .setJti("run")
            .setIssuedAt()
            .setExpirationTime("10m")
            .sign(
                new TextEncoder().encode(
                    `pollinations-agent-run-token:v1\0${env.BETTER_AUTH_SECRET}`,
                ),
            );
        await expect(
            verifyAgentRunToken(`ag_${jwt}`, env.BETTER_AUTH_SECRET),
        ).rejects.toThrow("Invalid agent run token claims");
    }
});

test("Quest rejects paid models and aliases before handlers, even with purchased balance and pollen=all", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const restricted = await tokenFor(parent.id, "quest");
    const registry = await getGenerationModelRegistry(env);
    for (const eventType of ["generate.text", "generate.image"] as const) {
        const paid = registry
            .visibleEntries()
            .find(
                (entry) =>
                    entry.eventType === eventType &&
                    entry.definition.paidOnly === true,
            );
        assert(paid);
        for (const model of [paid.id, ...paid.aliases.slice(0, 1)]) {
            const path = `/?model=${encodeURIComponent(model)}`;
            expect(
                (await dispatch(resolutionApp(eventType), path, restricted))
                    .status,
            ).toBe(403);
            expect(
                (
                    await dispatch(
                        resolutionApp(eventType),
                        `${path}&pollen=all`,
                        restricted,
                    )
                ).status,
            ).toBe(403);
            expect(
                (
                    await dispatch(resolutionApp(eventType), "/", restricted, {
                        model,
                        pollen: "all",
                    })
                ).status,
            ).toBe(403);
            expect(
                (
                    await dispatch(
                        resolutionApp(eventType),
                        `${path}&pollen=quest`,
                        parent.key,
                    )
                ).status,
            ).toBe(403);
            expect(
                (await dispatch(resolutionApp(eventType), path, parent.key))
                    .status,
            ).toBe(200);
        }
    }
    expect(
        (await dispatch(resolutionApp(), "/?pollen=invalid", restricted))
            .status,
    ).toBe(400);
});

test("Quest catalog filtering uses paid_only, not price or wallet balance, including retrieval", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const restricted = await tokenFor(parent.id, "quest");
    const fetchCatalog = (path: string, token: string) =>
        SELF.fetch(`https://gen.pollinations.ai${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
    const all = (await (await fetchCatalog("/models", parent.key)).json()) as {
        name: string;
        paid_only?: boolean;
    }[];
    expect(all.some((entry) => entry.paid_only)).toBe(true);
    for (const path of [
        "/models",
        "/text/models",
        "/image/models",
        "/audio/models",
        "/embeddings/models",
    ]) {
        const response = await fetchCatalog(path, restricted);
        expect(response.status).toBe(200);
        const entries = (await response.json()) as {
            name: string;
            paid_only?: boolean;
        }[];
        expect(entries.every((entry) => entry.paid_only !== true)).toBe(true);
        if (path === "/models")
            expect(entries.map((entry) => entry.name)).toEqual(
                all
                    .filter((entry) => !entry.paid_only)
                    .map((entry) => entry.name),
            );
    }
    const openai = (await (
        await fetchCatalog("/v1/models", restricted)
    ).json()) as { data: { id: string }[] };
    expect(openai.data.map((entry) => entry.id)).toEqual(
        all.filter((entry) => !entry.paid_only).map((entry) => entry.name),
    );
    const paid = all.find((entry) => entry.paid_only);
    assert(paid);
    expect(
        (
            await fetchCatalog(
                `/v1/models/${encodeURIComponent(paid.name)}`,
                restricted,
            )
        ).status,
    ).toBe(404);
});

test("Quest excludes paid fallback implementations without changing the shared registry", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const registry = await getGenerationModelRegistry(env);
    const primary = registry
        .visibleEntries()
        .find(
            (entry) =>
                entry.eventType === "generate.text" &&
                !entry.communityEndpoint &&
                entry.definition.paidOnly !== true,
        );
    assert(primary);
    const original = primary.fallbackEntries;
    const paid = {
        ...primary,
        id: "paid-provider",
        definition: {
            ...primary.definition,
            fallbackOnly: true,
            paidOnly: true,
        },
        fallbackEntries: undefined,
    };
    const eligible = {
        ...primary,
        id: "eligible-provider",
        definition: { ...primary.definition, fallbackOnly: true },
        fallbackEntries: undefined,
    };
    primary.fallbackEntries = [paid, eligible];
    try {
        const restricted = await tokenFor(parent.id, "quest");
        const path = `/?model=${encodeURIComponent(primary.id)}`;
        expect(
            await (await dispatch(resolutionApp(), path, restricted)).json(),
        ).toMatchObject({ fallbacks: [eligible.id] });
        expect(
            await (await dispatch(resolutionApp(), path, parent.key)).json(),
        ).toMatchObject({ fallbacks: [paid.id, eligible.id] });
        expect(primary.fallbackEntries).toEqual([paid, eligible]);
    } finally {
        primary.fallbackEntries = original;
    }
});

test("restored durable snapshots preserve Quest enforcement", async () => {
    const registry = await getGenerationModelRegistry(env);
    const paid = registry
        .visibleEntries()
        .find(
            (entry) =>
                entry.eventType === "generate.text" &&
                entry.definition.paidOnly === true,
        );
    assert(paid);
    const app = new Hono<Env>()
        .use(
            "*",
            authFromSnapshot({
                user: { id: "test", tier: "seed" },
                agentRun: {
                    parentApiKeyId: "key",
                    parentRequestId: "request",
                    issuedAt: 1,
                    expiresAt: 2,
                    pollen: "quest",
                },
            }),
        )
        .use("*", resolveModel("generate.text"))
        .all("*", (c) => c.text("should not run"));
    expect(
        (
            await app.fetch(
                new Request(
                    `https://gen.pollinations.ai/?model=${encodeURIComponent(paid.id)}`,
                ),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(403);
});

test("a paid cached text response cannot bypass signed Quest model access", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const restricted = await tokenFor(parent.id, "quest");
    const registry = await getGenerationModelRegistry(env);
    const paid = registry
        .visibleEntries()
        .find(
            (entry) =>
                entry.eventType === "generate.text" &&
                entry.definition.paidOnly === true,
        );
    assert(paid);
    let executions = 0;
    const app = new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", log);
            c.set("requestId", "test");
            await next();
        })
        .use("*", auth())
        .use("*", resolveModel("generate.text"))
        .use("*", textCache)
        .all("*", () => {
            executions++;
            return new Response("paid output");
        });
    const path = `/?model=${encodeURIComponent(paid.id)}&seed=${crypto.randomUUID()}`;
    const ctx = createExecutionContext();
    const response = await app.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            headers: { Authorization: `Bearer ${parent.key}` },
        }),
        env,
        ctx,
    );
    expect(await response.text()).toBe("paid output");
    await waitOnExecutionContext(ctx);
    const cached = await dispatch(app, path, parent.key);
    expect(cached.headers.get("X-Cache")).toBe("HIT");
    expect(await cached.text()).toBe("paid output");
    expect((await dispatch(app, path, restricted)).status).toBe(403);
    expect(executions).toBe(1);
});

test("token-only Quest requests partition both text and media cache identities", async () => {
    const parent = await createTestApiKey({ user: { packBalance: 100 } });
    const restricted = await tokenFor(parent.id, "quest");
    const registry = await getGenerationModelRegistry(env);
    for (const [eventType, cache] of [
        ["generate.text", textCache],
        ["generate.image", imageCache],
    ] as const) {
        const eligible = registry
            .visibleEntries()
            .find(
                (entry) =>
                    entry.eventType === eventType &&
                    !entry.communityEndpoint &&
                    entry.definition.paidOnly !== true,
            );
        assert(eligible);
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", log);
                c.set("requestId", "test");
                await next();
            })
            .use("*", auth())
            .use("*", resolveModel(eventType))
            .use("*", cache)
            .all("*", (c) => c.json({ key: c.var.generationCache?.key }, 400));
        const path = `/?model=${encodeURIComponent(eligible.id)}&seed=${crypto.randomUUID()}`;
        const all = (await (await dispatch(app, path, parent.key)).json()) as {
            key: string;
        };
        const quest = (await (
            await dispatch(app, path, restricted)
        ).json()) as { key: string };
        expect(all.key).toBeTruthy();
        expect(quest.key).toBeTruthy();
        expect(quest.key).not.toBe(all.key);
        expect(await (await dispatch(app, path, restricted)).json()).toEqual(
            quest,
        );
    }
});
