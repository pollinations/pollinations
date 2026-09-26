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
import { zipSync } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
    stemArchiveSeconds,
    stemInputSeconds,
} from "../src/audio/stem-separation.ts";
import worker from "../src/index.ts";
import fixture from "./fixtures/stem-input.json";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

const input = () =>
    new File(
        [Uint8Array.from(atob(fixture.mp3), (c) => c.charCodeAt(0))],
        "tone.mp3",
        { type: "audio/mpeg" },
    );
const zip = zipSync({
    "vocals.mp3": Uint8Array.from(atob(fixture.mp3), (c) => c.charCodeAt(0)),
});

afterEach(teardownFetchMock);
beforeEach(async () => {
    await createFetchMock({ tinybird: createMockTinybird() }).enable(
        "tinybird",
    );
});

it("meters decoded MP3 samples without charging encoder padding", async () => {
    expect(await stemInputSeconds(input())).toBe(0.25);
    expect(await stemArchiveSeconds(zip)).toBe(0.25);
});

it("rejects invalid uploaded audio before provider execution", async () => {
    await expect(
        stemInputSeconds(new File(["invalid"], "bad.mp3")),
    ).rejects.toMatchObject({ status: 400 });
});

it("rejects malformed upstream archives instead of billing guessed duration", async () => {
    await expect(
        stemArchiveSeconds(new Uint8Array([1, 2])),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
        stemArchiveSeconds(zipSync({ "vocals.mp3": new Uint8Array([1, 2]) })),
    ).rejects.toMatchObject({ status: 502 });
});

for (const variation of ["two_stems_v1", "six_stems_v1", undefined]) {
    test(`separates ${variation ?? "default"}, meters once, and caches its archive`, async () => {
        const tinybird = createMockTinybird();
        const calls: { url: string; variation: FormDataEntryValue | null }[] =
            [];
        const mocks = createFetchMock({
            tinybird,
            elevenlabs: {
                state: {},
                reset() {},
                handlerMap: {
                    "api.elevenlabs.io": async (request) => {
                        calls.push({
                            url: request.url,
                            variation: (await request.formData()).get(
                                "stem_variation_id",
                            ),
                        });
                        return new Response(zip, {
                            headers: { "content-type": "application/zip" },
                        });
                    },
                },
            },
        });
        await mocks.enable("elevenlabs", "tinybird");
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 1 },
            allowedModels: ["elevenlabs/stem-separation"],
        });
        const bindings = withInlineGenerationCoordinator({
            ...env,
            ELEVENLABS_API_KEY: "test",
        });
        const form = new FormData();
        form.set("model", "elevenlabs/stem-separation");
        form.set("file", input());
        if (variation) form.set("stem_variation_id", variation);
        async function run() {
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    "https://gen.pollinations.ai/audio/stem-separation",
                    {
                        method: "POST",
                        headers: { Authorization: `Bearer ${key}` },
                        body: form,
                    },
                ),
                bindings,
                ctx,
            );
            const body = new Uint8Array(await response.arrayBuffer());
            await waitOnExecutionContext(ctx);
            return { response, body };
        }
        const first = await run();
        expect(first.response.status).toBe(200);
        expect(first.response.headers.get("content-type")).toBe(
            "application/zip",
        );
        expect(first.response.headers.get("x-usage-prompt-audio-seconds")).toBe(
            "0.25",
        );
        expect(first.body).toEqual(zip);
        const cached = await run();
        expect(cached.response.status).toBe(200);
        expect(cached.response.headers.get("x-cache")).toBe("HIT");
        expect(cached.response.headers.get("content-disposition")).toContain(
            "stems.zip",
        );
        expect(cached.body).toEqual(zip);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(
            "https://api.elevenlabs.io/v1/music/stem-separation?output_format=mp3_44100_128",
        );
        expect(calls[0].variation).toBe(variation ?? "six_stems_v1");
        const billed = tinybird.state.events.filter((e) => e.isBilledUsage);
        expect(billed).toHaveLength(1);
        const rate = variation === "two_stems_v1" ? 0.0025 : 0.005;
        expect(billed[0]).toMatchObject({
            modelUsed: "elevenlabs/stem-separation",
            modelProviderUsed: "elevenlabs",
            tokenCountPromptAudioSeconds: 0.25,
            tokenPricePromptAudioSeconds: rate,
            totalCost: rate * 0.25,
            totalPrice: rate * 0.25,
        });
        const balance = await getUserBalance(drizzle(env.DB), userId);
        expect(balance.packBalance).toBeCloseTo(1 - rate * 0.25, 10);
    });
}

test("requires purchased balance", async ({ apiKey }) => {
    const form = new FormData();
    form.set("file", input());
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/audio/stem-separation", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        }),
        withInlineGenerationCoordinator(env),
        createExecutionContext(),
    );
    expect(response.status).toBe(402);
});

test("enforces model permissions", async () => {
    const { key } = await createTestApiKey({
        user: { packBalance: 1 },
        allowedModels: ["elevenlabs/voice-isolator"],
    });
    const form = new FormData();
    form.set("file", input());
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/audio/stem-separation", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: form,
        }),
        withInlineGenerationCoordinator(env),
        createExecutionContext(),
    );
    expect(response.status).toBe(403);
});

for (const invalid of ["variation", "file", "wrong-endpoint"]) {
    test(`rejects invalid ${invalid}`, async ({ paidApiKey }) => {
        const form = new FormData();
        form.set("model", "elevenlabs/stem-separation");
        if (invalid !== "file") form.set("file", input());
        if (invalid === "variation")
            form.set("stem_variation_id", "four_stems_v1");
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                `https://gen.pollinations.ai/${invalid === "wrong-endpoint" ? "v1/audio/speech" : "audio/stem-separation"}`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${paidApiKey}` },
                    body: form,
                },
            ),
            withInlineGenerationCoordinator(env),
            ctx,
        );
        expect(response.status).toBe(400);
        await response.arrayBuffer();
        await waitOnExecutionContext(ctx);
    });
}
