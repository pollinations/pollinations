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
import worker from "../../src/index.ts";
import { MMAUDIO_VERSION } from "../../src/video/mmaudio.ts";
import { mp4TrackDurations } from "../../src/video/mp4.ts";
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
    });
});
afterEach(async () => {
    release?.();
    await teardownFetchMock();
});

async function request(
    key: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    path = "/video/audio",
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal,
        }),
        bindings,
        ctx,
    );
    await response.clone().arrayBuffer();
    await waitOnExecutionContext(ctx);
    return response;
}
const body = () => ({
    model: "sony/mmaudio-v2",
    video_url: "https://example.com/video.mp4",
    prompt: `Rain falling ${crypto.randomUUID()}`,
    seed: 42,
});

test("Replicate bills reported GPU time and rejoins one generation", async () => {
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
    expect(replicateBodies).toEqual([
        {
            version: MMAUDIO_VERSION,
            input: {
                video: input.video_url,
                prompt: input.prompt,
                duration: 8,
                negative_prompt: "",
                seed: 42,
                num_steps: 25,
                cfg_strength: 4.5,
            },
        },
    ]);
    const billed = mocks.tinybird.state.events.filter(
        (event) => event.isBilledUsage,
    );
    expect(billed).toHaveLength(1);
    // Prices are rounded to 8 decimals; costs keep full precision.
    expect(billed[0].totalPrice).toBeCloseTo(4.074095673 * 0.000975, 8);
    expect(billed[0]).toMatchObject({
        totalCost: 4.074095673 * 0.000975,
        modelProviderUsed: "replicate",
        adjustmentUnits: { "replicate.mmaudio.compute.v1": 4.074095673 },
    });
    const balance = await getUserBalance(drizzle(env.DB), userId);
    expect(balance.packBalance).toBeCloseTo(1 - 4.074095673 * 0.000975, 8);
});

test("invalid source and unsupported fields fail before the provider runs", async ({
    paidApiKey,
}) => {
    for (const invalid of [
        { video_url: "http://127.0.0.1/test.mp4" },
        { duration: 0 },
        { duration: 31 },
        { num_steps: 50 },
    ]) {
        expect(
            (await request(paidApiKey, { ...body(), ...invalid })).status,
        ).toBe(400);
    }
    expect(replicateBodies).toHaveLength(0);
});

test("paid access and model permissions are enforced", async ({
    apiKey,
    restrictedApiKey,
}) => {
    expect((await request(apiKey, body())).status).toBe(402);
    expect((await request(restrictedApiKey, body())).status).toBe(403);
    expect(replicateBodies).toHaveLength(0);
});

test("provider validation errors are not billed", async ({ paidApiKey }) => {
    status = 422;
    expect((await request(paidApiKey, body())).status).toBe(422);
    expect(
        mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
    ).toHaveLength(0);
});

test("missing Replicate usage cannot produce a free success", async ({
    paidApiKey,
}) => {
    computeSeconds = 0;
    expect((await request(paidApiKey, body())).status).toBe(502);
    expect(
        mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
    ).toHaveLength(0);
});

test("malformed media is rejected", async ({ paidApiKey }) => {
    mediaBytes = new TextEncoder().encode('{"error":"broken output"}');
    expect((await request(paidApiKey, body())).status).toBe(502);
});

test("track parser keeps compute, video and audio durations distinct and rejects truncation", () => {
    expect(mp4TrackDurations(mp4)).toEqual({ video: 5, audio: 5.04 });
    expect(() => mp4TrackDurations(mp4.subarray(0, mp4.length - 1))).toThrow();
    expect(() =>
        mp4TrackDurations(
            Buffer.concat([box("ftyp"), box("moov", track("vide", 5000))]),
        ),
    ).toThrow();
});

test("catalog shows GPU pricing and price scales compute cost by the multiplier", () => {
    const definition = IMAGE_SERVICES["sony/mmaudio-v2"];
    const info = modelInfoFromDefinition("sony/mmaudio-v2", definition);
    expect(info.pricing_adjustments).toHaveLength(1);
    const billed = calculateUsageBilling({
        model: "sony/mmaudio-v2",
        servedBy: { ...definition, priceMultiplier: 2 },
        usage: { completionVideoSeconds: 5 },
        input: { computeSeconds: 100 },
    });
    expect(billed.cost.totalCost).toBeCloseTo(0.0975);
    expect(billed.price.totalPrice).toBeCloseTo(0.195);
});
