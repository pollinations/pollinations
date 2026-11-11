import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

afterEach(() => vi.restoreAllMocks());

it("submits, survives a disconnect, isolates accounts, caches the result, and charges once", async () => {
    const owner = await createTestApiKey({ user: { packBalance: 100 } });
    const other = await createTestApiKey({ user: { packBalance: 100 } });
    env.REPLICATE_API_TOKEN = "workers-test-only";
    const tinybird = createMockTinybird();
    const output = Uint8Array.from(
        atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
        ),
        (char) => char.charCodeAt(0),
    );
    let executions = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
        started = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "api.replicate.com") {
            expect(url.pathname).toBe(
                "/v1/models/bytedance/seedream-4/predictions",
            );
            executions++;
            started();
            await blocked;
            return Response.json(
                {
                    id: "async-seedream-test",
                    status: "succeeded",
                    output: ["https://replicate.delivery/async-seedream.png"],
                },
                { status: 201 },
            );
        }
        if (url.host === "replicate.delivery") {
            return new Response(output, {
                headers: { "content-type": "image/png" },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });

    const url = `https://gen.pollinations.ai/image/async-job-${crypto.randomUUID()}?model=bytedance/seedream-4.0&safe=false&width=1024&height=1024`;
    const request = (key: string, prefer = true) =>
        new Request(url, {
            headers: {
                authorization: `Bearer ${key}`,
                ...(prefer && { Prefer: "respond-async" }),
            },
        });
    const statusRequest = (path: string, key: string) =>
        new Request(`https://gen.pollinations.ai${path}`, {
            headers: { authorization: `Bearer ${key}` },
        });
    const before = await getUserBalance(drizzle(env.DB), owner.userId);
    const ctx = createExecutionContext();
    const submitted = await worker.fetch(request(owner.key), env, ctx);
    expect(submitted.status, await submitted.clone().text()).toBe(202);
    const {
        id,
        status,
        status_url: statusUrl,
    } = await submitted.json<{
        id: string;
        status: string;
        status_url: string;
    }>();
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(status).toBe("pending");
    expect(submitted.headers.get("Location")).toBe(statusUrl);
    expect(submitted.headers.get("Preference-Applied")).toBe("respond-async");
    await providerStarted;
    // The submitting HTTP connection is gone; the alarm keeps the provider call alive.
    await waitOnExecutionContext(ctx);

    const path = `/v1/jobs/${id}`;
    expect(
        (
            await worker.fetch(
                statusRequest(path, owner.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(200);
    expect(
        (
            await worker.fetch(
                statusRequest(path, other.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(404);
    expect(
        (
            await worker.fetch(
                statusRequest(`${path}/result`, other.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(404);
    expect(
        (
            await worker.fetch(
                statusRequest(`${path}/result`, owner.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(409);

    const again = await worker.fetch(
        request(owner.key),
        env,
        createExecutionContext(),
    );
    expect(again.status).toBe(202);
    expect((await again.json<{ id: string }>()).id).toBe(id);
    // A second account can submit the identical request, but cannot take away
    // the original account's access or trigger another upstream execution.
    const joined = await worker.fetch(
        request(other.key),
        env,
        createExecutionContext(),
    );
    expect(joined.status).toBe(202);
    expect((await joined.json<{ id: string }>()).id).toBe(id);
    expect(
        (
            await worker.fetch(
                statusRequest(path, other.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(200);
    expect(
        (
            await worker.fetch(
                statusRequest(path, owner.key),
                env,
                createExecutionContext(),
            )
        ).status,
    ).toBe(200);
    release();

    let completed!: Response;
    await vi.waitFor(
        async () => {
            completed = await worker.fetch(
                statusRequest(path, owner.key),
                env,
                createExecutionContext(),
            );
            expect((await completed.json<{ status: string }>()).status).toBe(
                "succeeded",
            );
        },
        { timeout: 20_000 },
    );
    const result = await worker.fetch(
        statusRequest(`${path}/result`, owner.key),
        env,
        createExecutionContext(),
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(output);

    const cached = await worker.fetch(
        request(owner.key, false),
        env,
        createExecutionContext(),
    );
    expect(cached.status).toBe(200);
    expect(cached.headers.get("x-cache")).toBe("HIT");
    await cached.arrayBuffer();
    await vi.waitFor(() =>
        expect(
            tinybird.state.events.filter((event) => event.isBilledUsage),
        ).toHaveLength(1),
    );
    const billed = tinybird.state.events.filter((event) => event.isBilledUsage);
    expect(executions).toBe(1);
    expect(billed).toHaveLength(1);
    const after = await getUserBalance(drizzle(env.DB), owner.userId);
    expect(before.packBalance - after.packBalance).toBeCloseTo(
        billed[0].totalPrice,
        8,
    );
    const otherBalance = await getUserBalance(drizzle(env.DB), other.userId);
    expect(otherBalance.packBalance).toBe(100);
}, 30_000);

// Ported from #17286 (Drjacky) and #17353 (tomdacatto): the OpenAI images
// route, with several preferences in one Prefer header (RFC 7240).
it("submits POST /v1/images/generations with Prefer: wait=10, respond-async", async () => {
    const owner = await createTestApiKey({ user: { packBalance: 100 } });
    env.REPLICATE_API_TOKEN = "workers-test-only";
    const tinybird = createMockTinybird();
    const output = new TextEncoder().encode("openai-async-image");
    let executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "api.replicate.com") {
            executions++;
            return Response.json(
                {
                    id: "async-openai-test",
                    status: "succeeded",
                    output: ["https://replicate.delivery/async-openai.png"],
                },
                { status: 201 },
            );
        }
        if (url.host === "replicate.delivery") {
            return new Response(output, {
                headers: { "content-type": "image/png" },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });
    const get = (path: string) =>
        worker.fetch(
            new Request(`https://gen.pollinations.ai${path}`, {
                headers: { authorization: `Bearer ${owner.key}` },
            }),
            env,
            createExecutionContext(),
        );

    const submitted = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/images/generations", {
            method: "POST",
            headers: {
                authorization: `Bearer ${owner.key}`,
                "content-type": "application/json",
                Prefer: "wait=10, respond-async",
            },
            body: JSON.stringify({
                model: "bytedance/seedream-4.0",
                prompt: `async job ${crypto.randomUUID()}`,
                seed: 42,
                response_format: "url",
            }),
        }),
        env,
        createExecutionContext(),
    );
    expect(submitted.status, await submitted.clone().text()).toBe(202);
    expect(submitted.headers.get("Preference-Applied")).toBe("respond-async");
    const { id } = await submitted.json<{ id: string }>();

    await vi.waitFor(
        async () => {
            const status = await get(`/v1/jobs/${id}`);
            expect((await status.json<{ status: string }>()).status).toBe(
                "succeeded",
            );
        },
        { timeout: 20_000 },
    );
    const result = await get(`/v1/jobs/${id}/result`);
    expect(result.status).toBe(200);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(output);
    expect(executions).toBe(1);
}, 30_000);

// A retry of a failed job must not take the record away from the accounts
// that submitted the identical request; they keep reading it for 24 hours.
it("keeps a failed job readable by its owner when another account retries the identical request", async () => {
    const owner = await createTestApiKey({ user: { packBalance: 100 } });
    const retrying = await createTestApiKey({ user: { packBalance: 100 } });
    env.REPLICATE_API_TOKEN = "workers-test-only";
    const tinybird = createMockTinybird();
    const output = Uint8Array.from(
        atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
        ),
        (char) => char.charCodeAt(0),
    );
    let executions = 0;
    let providerShouldFail = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "api.replicate.com") {
            executions++;
            if (providerShouldFail) {
                return new Response("upstream exploded", { status: 500 });
            }
            return Response.json(
                {
                    id: "async-retry-test",
                    status: "succeeded",
                    output: ["https://replicate.delivery/async-retry.png"],
                },
                { status: 201 },
            );
        }
        if (url.host === "replicate.delivery") {
            return new Response(output, {
                headers: { "content-type": "image/png" },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });

    const url = `https://gen.pollinations.ai/image/async-retry-${crypto.randomUUID()}?model=bytedance/seedream-4.0&safe=false&width=1024&height=1024`;
    const request = (key: string) =>
        new Request(url, {
            headers: {
                authorization: `Bearer ${key}`,
                Prefer: "respond-async",
            },
        });
    const statusRequest = (key: string, id: string) =>
        worker.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${id}`, {
                headers: { authorization: `Bearer ${key}` },
            }),
            env,
            createExecutionContext(),
        );

    // The owner's generation fails upstream.
    const submitted = await worker.fetch(
        request(owner.key),
        env,
        createExecutionContext(),
    );
    expect(submitted.status, await submitted.clone().text()).toBe(202);
    const { id } = await submitted.json<{ id: string }>();
    await vi.waitFor(async () => {
        const failed = await statusRequest(owner.key, id);
        expect(failed.status).toBe(200);
        expect((await failed.json<{ status: string }>()).status).toBe("failed");
    });
    providerShouldFail = false;

    // Another account retries the identical request: a new run is expected,
    // executed and billed once for the retrying account.
    const retry = await worker.fetch(
        request(retrying.key),
        env,
        createExecutionContext(),
    );
    expect(retry.status, await retry.clone().text()).toBe(202);
    expect((await retry.json<{ id: string }>()).id).toBe(id);
    await vi.waitFor(async () => {
        const succeeded = await statusRequest(retrying.key, id);
        expect((await succeeded.json<{ status: string }>()).status).toBe(
            "succeeded",
        );
    });

    // The original account submitted this identical request, so its job
    // record must stay readable for the promised 24 hours.
    const ownerStatus = await statusRequest(owner.key, id);
    expect(
        ownerStatus.status,
        (await ownerStatus.clone().text()) || undefined,
    ).toBe(200);
    expect((await ownerStatus.json<{ status: string }>()).status).toBe(
        "succeeded",
    );

    expect(executions).toBeGreaterThanOrEqual(2);
    const billed = tinybird.state.events.filter((event) => event.isBilledUsage);
    expect(billed).toHaveLength(1);
    const retryingBalance = await getUserBalance(
        drizzle(env.DB),
        retrying.userId,
    );
    expect(retryingBalance.packBalance).toBeLessThan(100);
    const ownerBalance = await getUserBalance(drizzle(env.DB), owner.userId);
    expect(ownerBalance.packBalance).toBe(100);
}, 30_000);
