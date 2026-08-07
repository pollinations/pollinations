import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect } from "vitest";
import worker from "../../src/index.ts";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";

type ProviderBody = Record<string, unknown>;

function create3dMocks() {
    const inferenceportBodies: ProviderBody[] = [];
    const falBodies: ProviderBody[] = [];
    const tinybird = createMockTinybird();
    const tinybirdHandler =
        tinybird.handlerMap["api.europe-west2.gcp.tinybird.co"];
    tinybird.handlerMap["api.europe-west2.gcp.tinybird.co"] = async (
        request: Request,
    ) => {
        if (request.url.includes("public_model_stats.json")) {
            return Response.json({ data: [] });
        }
        return tinybirdHandler(request);
    };

    return createFetchMock({
        tinybird,
        inferenceport: {
            state: { bodies: inferenceportBodies },
            handlerMap: {
                "api.inferenceport.ai": async (request: Request) => {
                    inferenceportBodies.push(await request.json());
                    return Response.json({
                        data: [{ model_glb_b64_bytes: btoa("glTF") }],
                    });
                },
            },
            reset: () => {
                inferenceportBodies.length = 0;
            },
        },
        fal: {
            state: { bodies: falBodies },
            handlerMap: {
                "queue.fal.run": async (request: Request) => {
                    const pathname = new URL(request.url).pathname;
                    if (request.method === "POST") {
                        falBodies.push(await request.json());
                        return Response.json(
                            {
                                request_id: "request-1",
                                status_url:
                                    "https://queue.fal.run/requests/request-1/status",
                                response_url:
                                    "https://queue.fal.run/requests/request-1/result",
                            },
                            { status: 202 },
                        );
                    }
                    if (pathname.endsWith("/status")) {
                        return Response.json({ status: "COMPLETED" });
                    }
                    return Response.json({
                        model_mesh: {
                            url: "https://models.example.test/model.glb",
                        },
                    });
                },
                "models.example.test": async () =>
                    new Response(new TextEncoder().encode("glTF")),
            },
            reset: () => {
                falBodies.length = 0;
            },
        },
    });
}

let mocks: ReturnType<typeof create3dMocks>;

beforeEach(() => {
    mocks = create3dMocks();
});

afterEach(async () => {
    await teardownFetchMock();
    mocks.tinybird.reset();
    mocks.inferenceport.reset();
    mocks.fal.reset();
});

async function fetch3d(
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    await response.clone().arrayBuffer();
    await waitOnExecutionContext(ctx);
    return response;
}

test("POST /3d sends JSON Trellis parameters through billing without URL-only caching", async () => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
    await mocks.enable("tinybird", "inferenceport");
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 2 },
    });
    const prompt = crypto.randomUUID();

    for (const [resolution, seed] of [
        ["low", 101],
        ["high", 202],
    ] as const) {
        const response = await fetch3d(`/3d/${prompt}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "trellis-2",
                image: ["https://example.com/reference.jpg"],
                resolution,
                seed,
            }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBeNull();
        expect(await response.text()).toBe("glTF");
    }

    expect(mocks.inferenceport.state.bodies).toEqual([
        {
            model: "trellis2",
            image_urls: ["https://example.com/reference.jpg"],
            resolution: "low",
        },
        {
            model: "trellis2",
            image_urls: ["https://example.com/reference.jpg"],
            resolution: "high",
        },
    ]);
    expect(mocks.tinybird.state.events).toHaveLength(2);
    expect(mocks.tinybird.state.events).toEqual([
        expect.objectContaining({
            modelRequested: "trellis-2",
            modelUsed: "trellis-2",
            tokenPriceCompletionImage: 0.24,
            totalPrice: 0.24,
        }),
        expect.objectContaining({
            modelRequested: "trellis-2",
            modelUsed: "trellis-2",
            costVariant: "high",
            tokenPriceCompletionImage: 0.35,
            totalPrice: 0.35,
        }),
    ]);
    const balance = await getUserBalance(drizzle(env.DB), userId);
    expect(balance.tierBalance).toBeCloseTo(1.41, 10);
});

test("POST /3d sends JSON image and seed to the existing Rodin provider path", async () => {
    syncModel3dEnvironment({
        ...env,
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings);
    await mocks.enable("tinybird", "fal");
    const { key } = await createTestApiKey({
        user: { packBalance: 1 },
    });

    const response = await fetch3d(`/3d/${crypto.randomUUID()}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "hyper3d-rodin",
            image: "https://example.com/reference.jpg?crop=1,2",
            seed: 42,
        }),
    });

    expect(response.status).toBe(200);
    expect(mocks.fal.state.bodies).toEqual([
        {
            image_urls: ["https://example.com/reference.jpg?crop=1,2"],
            prompt: expect.any(String),
            seed: 42,
        },
    ]);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        modelRequested: "hyper3d-rodin",
        modelUsed: "hyper3d-rodin",
        tokenPriceCompletionImage: 0.1,
        totalPrice: 0.1,
    });
}, 10_000);

test("POST /3d preserves authentication and rejects ignored parameters", async ({
    apiKey,
}) => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
    await mocks.enable("tinybird", "inferenceport");
    const body = {
        model: "trellis-2",
        image: "https://example.com/reference.jpg",
        resolution: "low",
    };

    const unauthenticated = await fetch3d("/3d/auth-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    expect(unauthenticated.status).toBe(401);

    const queryAuthenticated = await fetch3d(
        `/3d/query-auth?key=${apiKey}&safe=false`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
    expect(queryAuthenticated.status).toBe(200);
    await queryAuthenticated.arrayBuffer();

    for (const invalidBody of [
        { ...body, safe: true },
        { ...body, format: "glb" },
        { ...body, resolution: "ultra" },
        { ...body, image: "ftp://example.com/reference.jpg" },
        { ...body, seed: "42" },
    ]) {
        const response = await fetch3d("/3d/validation-check", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(invalidBody),
        });
        expect(response.status).toBe(400);
    }

    for (const query of [
        "model=hyper3d-rodin",
        `image=${encodeURIComponent("https://example.com/other.jpg")}`,
        "resolution=high",
        "seed=42",
    ]) {
        const response = await fetch3d(`/3d/query-validation?${query}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        expect(response.status).toBe(400);
    }

    expect(mocks.inferenceport.state.bodies).toHaveLength(1);
});

test("GET /3d keeps query behavior and Trellis resolution", async ({
    apiKey,
}) => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
    await mocks.enable("tinybird", "inferenceport");

    const response = await fetch3d(
        `/3d/${crypto.randomUUID()}?model=trellis-2&image=${encodeURIComponent("https://example.com/reference.jpg")}&resolution=medium`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(mocks.inferenceport.state.bodies[0]).toMatchObject({
        resolution: "medium",
    });
});
