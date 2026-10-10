import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Buffer } from "node:buffer";
import { getUserBalance } from "@shared/billing/balance.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect } from "vitest";
import { MMAUDIO_VERSION } from "../../src/image/models/mmaudioModel.ts";
import { mp4TrackDurations } from "../../src/image/utils/mp4.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

// Minimal ISO BMFF track metadata, with deliberately different video/audio lengths.
function box(type: string, ...parts: Uint8Array[]): Buffer {
    const data = Buffer.concat(parts);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length + 8);
    header.write(type, 4);
    return Buffer.concat([header, data]);
}
function track(type: string, ms: number, version = 0): Buffer {
    const hdlr = Buffer.alloc(12);
    hdlr.write(type, 8);
    const mdhd = Buffer.alloc(version === 1 ? 32 : 20);
    mdhd[0] = version;
    mdhd.writeUInt32BE(1000, version === 1 ? 20 : 12);
    if (version === 1) mdhd.writeBigUInt64BE(BigInt(ms), 24);
    else mdhd.writeUInt32BE(ms, 16);
    return box("trak", box("mdia", box("hdlr", hdlr), box("mdhd", mdhd)));
}
const mp4 = Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box("moov", track("vide", 5000), track("soun", 5040, 1)),
]);

let status = 200;
let falUnits: string | undefined = "6";
let falBodies: Record<string, unknown>[];
let computeSeconds = 4.074095673;
let mediaBytes: Uint8Array = mp4;
let replicateBodies: Record<string, unknown>[];
let release: (() => void) | undefined;
let gate: Promise<void> | undefined;
let started: (() => void) | undefined;
let mocks: ReturnType<typeof makeMocks>;
let bindings: CloudflareBindings;

function makeMocks() {
    const tinybird = createMockTinybird();
    const tinybirdHandler =
        tinybird.handlerMap["api.europe-west2.gcp.tinybird.co"];
    tinybird.handlerMap["api.europe-west2.gcp.tinybird.co"] = async (
        request,
    ) =>
        request.url.includes("public_model_stats.json")
            ? Response.json({ data: [] })
            : tinybirdHandler(request);
    return createFetchMock({
        tinybird,
        providers: {
            state: {},
            reset() {},
            handlerMap: {
                "queue.fal.run": async (request: Request) => {
                    if (request.method === "POST") {
                        falBodies.push(await request.json());
                        started?.();
                        await gate;
                        if (status !== 200)
                            return Response.json(
                                { detail: "Request rejected" },
                                { status },
                            );
                        return Response.json({
                            status_url: "https://queue.fal.run/status",
                            response_url: "https://queue.fal.run/result",
                        });
                    }
                    if (request.url.endsWith("/status"))
                        return Response.json({ status: "COMPLETED" });
                    return Response.json(
                        {
                            video: {
                                url: "https://media.example.com/result.mp4",
                            },
                        },
                        {
                            headers:
                                falUnits === undefined
                                    ? {}
                                    : { "x-fal-billable-units": falUnits },
                        },
                    );
                },
                "api.replicate.com": async (request: Request) => {
                    replicateBodies.push(await request.json());
                    started?.();
                    await gate;
                    if (status !== 200)
                        return Response.json(
                            { detail: "Request rejected" },
                            { status },
                        );
                    return Response.json({
                        id: "replicate-test",
                        status: "succeeded",
                        output: "https://media.example.com/result.mp4",
                        metrics: { predict_time: computeSeconds },
                    });
                },
                "media.example.com": async () =>
                    new Response(new Uint8Array(mediaBytes), {
                        headers: { "content-type": "video/mp4" },
                    }),
            },
        },
    });
}

beforeEach(async () => {
    status = 200;
    falUnits = "6";
    falBodies = [];
    computeSeconds = 4.074095673;
    mediaBytes = mp4;
    replicateBodies = [];
    gate = undefined;
    started = undefined;
    release = undefined;
    mocks = makeMocks();
    await mocks.enable("tinybird", "providers");
    bindings = withInlineGenerationCoordinator({
        ...env,
        REPLICATE_API_TOKEN: "replicate-test",
        FAL_KEY: "fal-test",
    });
});
afterEach(async () => {
    release?.();
    await teardownFetchMock();
});

async function request(
    key: string,
    { prompt, ...query }: Record<string, string>,
    signal?: AbortSignal,
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(
            `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${new URLSearchParams(query)}`,
            { headers: { Authorization: `Bearer ${key}` }, signal },
        ),
        bindings,
        ctx,
    );
    await response.clone().arrayBuffer();
    await waitOnExecutionContext(ctx);
    return response;
}
const body = (): Record<string, string> => ({
    model: "sony/mmaudio-v2",
    reference_videos: "https://example.com/video.mp4",
    prompt: `Rain falling ${crypto.randomUUID()}`,
    seed: "42",
});
const computeRate =
    IMAGE_SERVICES["sony/mmaudio-v2:replicate"].billing?.adjustments?.[0]
        ?.unitCost ?? 0;

test(
    "fal bills reported seconds and rejoins one generation",
    { timeout: 30000 },
    async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 1 },
            allowedModels: ["sony/mmaudio-v2"],
        });
        const input = body();
        gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const ready = new Promise<void>((resolve) => {
            started = resolve;
        });
        const controller = new AbortController();
        const first = request(key, input, controller.signal);
        await ready;
        controller.abort();
        const joined = request(key, input);
        release?.();
        const responses = await Promise.all([first, joined]);
        responses.push(await request(key, input));
        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe("video/mp4");
            expect(response.headers.get("x-cache")).toBe("HIT");
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(
                new Uint8Array(mp4),
            );
        }
        expect(replicateBodies).toHaveLength(0);
        expect(falBodies).toEqual([
            {
                video_url: input.reference_videos,
                prompt: input.prompt,
                duration: 30,
                seed: 42,
                negative_prompt: "music",
                num_steps: 25,
                cfg_strength: 4.5,
            },
        ]);
        const billed = mocks.tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(billed).toHaveLength(1);
        // Prices are rounded to 8 decimals; costs keep full precision.
        expect(billed[0].totalPrice).toBeCloseTo(0.006, 8);
        expect(billed[0]).toMatchObject({
            totalCost: 0.006,
            modelProviderUsed: "fal",
            tokenCountCompletionVideoSeconds: 6,
        });
        const balance = await getUserBalance(drizzle(env.DB), userId);
        expect(balance.packBalance).toBeCloseTo(1 - 0.006, 8);
    },
);

test(
    "explicit duration overrides the full-clip default",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        for (const duration of [1, 8, 30]) {
            const response = await request(paidApiKey, {
                ...body(),
                duration: String(duration),
            });
            expect(response.status).toBe(200);
            expect(falBodies.at(-1)).toMatchObject({ duration });
        }
    },
);

test(
    "invalid source and unsupported fields fail before the provider runs",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        const invalidInputs: Record<string, string>[] = [
            { reference_videos: "http://127.0.0.1/test.mp4" },
            { reference_videos: "" },
            {
                reference_videos:
                    "https://example.com/a.mp4|https://example.com/b.mp4",
            },
            { duration: "0" },
            { duration: "31" },
            { image: "https://example.com/frame.png" },
            { resolution: "720p" },
            { resolution: "source" },
        ];
        for (const invalid of invalidInputs) {
            expect(
                (await request(paidApiKey, { ...body(), ...invalid })).status,
            ).toBe(400);
        }
        expect(replicateBodies).toHaveLength(0);
        expect(falBodies).toHaveLength(0);
    },
);

test(
    "paid access and model permissions are enforced",
    { timeout: 30000 },
    async ({ apiKey, restrictedApiKey }) => {
        expect((await request(apiKey, body())).status).toBe(402);
        expect((await request(restrictedApiKey, body())).status).toBe(403);
        expect(replicateBodies).toHaveLength(0);
        expect(falBodies).toHaveLength(0);
    },
);

test(
    "provider validation errors are not billed",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        status = 422;
        // The media route reports provider input validation as 400; 422 is reserved
        // for content-policy rejections.
        expect((await request(paidApiKey, body())).status).toBe(400);
        expect(
            mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
        ).toHaveLength(0);
    },
);

test(
    "missing usage on both providers cannot produce a free success",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        computeSeconds = 0;
        falUnits = undefined;
        expect((await request(paidApiKey, body())).status).toBe(502);
        expect(
            mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
        ).toHaveLength(0);
    },
);

test(
    "malformed media is rejected",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        mediaBytes = new TextEncoder().encode('{"error":"broken output"}');
        expect((await request(paidApiKey, body())).status).toBe(502);
    },
);

test("track parser keeps compute, video and audio durations distinct and rejects truncation", () => {
    expect(mp4TrackDurations(mp4)).toEqual({ video: 5, audio: 5.04 });
    expect(() => mp4TrackDurations(mp4.subarray(0, mp4.length - 1))).toThrow();
    expect(() =>
        mp4TrackDurations(
            Buffer.concat([box("ftyp"), box("moov", track("vide", 5000))]),
        ),
    ).toThrow();
});

test(
    "fallback keeps the fal price and records Replicate GPU cost",
    { timeout: 30000 },
    async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 1 },
            allowedModels: ["sony/mmaudio-v2"],
        });
        status = 503;
        mocks.providers.handlerMap["api.replicate.com"] = async (request) => {
            replicateBodies.push(await request.json());
            return Response.json({
                id: "fallback-test",
                status: "succeeded",
                output: "https://media.example.com/result.mp4",
                metrics: { predict_time: computeSeconds },
            });
        };
        await mocks.enable("tinybird", "providers");
        const input = body();
        expect((await request(key, input)).status).toBe(200);
        expect((await request(key, input)).status).toBe(200);
        expect(falBodies).toHaveLength(1);
        expect(replicateBodies).toHaveLength(1);
        expect(replicateBodies[0]).toMatchObject({
            version: MMAUDIO_VERSION,
            input: { negative_prompt: "music", duration: 30 },
        });
        const billed = mocks.tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(billed).toHaveLength(1);
        expect(billed[0]).toMatchObject({
            totalPrice: 0.03,
            totalCost: computeSeconds * computeRate,
            modelProviderUsed: "replicate",
            adjustmentUnits: { "replicate.mmaudio.compute.v1": computeSeconds },
            fallbackUsed: true,
        });
        expect(
            (await getUserBalance(drizzle(env.DB), userId)).packBalance,
        ).toBeCloseTo(0.97, 8);
    },
);

test(
    "large seeds fit fal's accepted range",
    { timeout: 30000 },
    async ({ paidApiKey }) => {
        expect(
            (await request(paidApiKey, { ...body(), seed: "15493081" })).status,
        ).toBe(200);
        expect(falBodies[0].seed).toBe(15493081 % 65536);
    },
);

test("catalog shows source-video input and per-second pricing", () => {
    const definition = IMAGE_SERVICES["sony/mmaudio-v2"];
    const info = modelInfoFromDefinition("sony/mmaudio-v2", definition);
    expect(info.video_capabilities).toContain("reference_videos");
    expect(info.max_reference_videos).toBe(1);
    expect(info.default_duration).toBe(30);
    expect(info.resolutions).toBeUndefined();
    expect(definition.provider).toBe("fal");
    const billed = calculateUsageBilling({
        model: "sony/mmaudio-v2",
        quotedBy: definition,
        servedBy: IMAGE_SERVICES["sony/mmaudio-v2:replicate"],
        usage: { completionVideoSeconds: 5 },
        input: { computeSeconds: 100 },
    });
    expect(billed.cost.totalCost).toBeCloseTo(100 * computeRate);
    expect(billed.price.totalPrice).toBe(0.005);
});
