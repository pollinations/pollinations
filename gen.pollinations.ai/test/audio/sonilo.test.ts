import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    PROVIDER_BILLING_HEADERS,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSoniloSfx, SONILO_MODEL } from "../../src/audio/sonilo.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const options = {
    prompt: "fire crackling, soft whoosh",
    referenceVideo: "https://example.com/clip.mp4",
    responseFormat: "mp3",
    falKey: "test-fal",
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function mockFal(output: () => Response) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = String(url);
        if (href.startsWith("https://api.fal.ai/v1/models/pricing"))
            return Response.json({
                prices: [
                    {
                        endpoint_id: "sonilo/v1.1/video-to-sound-effects",
                        unit_price: 0.009,
                        currency: "USD",
                    },
                ],
            });
        if (href === "https://queue.fal.run/sonilo/v1.1/video-to-sound-effects")
            return Response.json({
                status_url: "https://queue.fal.run/status",
                response_url: "https://queue.fal.run/result",
            });
        if (href === "https://queue.fal.run/status")
            return Response.json({ status: "COMPLETED" });
        if (href === "https://queue.fal.run/result")
            return Response.json(
                { audio: { url: "https://fal.media/sfx.mp3" } },
                { headers: { "x-fal-billable-units": "12" } },
            );
        return output();
    });
}

describe("Sonilo 1.1 SFX", () => {
    it("bills fal's reported seconds at its live price", async () => {
        vi.useFakeTimers();
        const fetchSpy = mockFal(
            () =>
                new Response("ID3sfx", {
                    headers: { "content-type": "audio/mpeg" },
                }),
        );
        const pending = generateSoniloSfx(options);
        await vi.advanceTimersByTimeAsync(5000);
        const response = await pending;

        expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
            "ID3sfx",
        );
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        const submit = fetchSpy.mock.calls.find(
            ([url]) =>
                url ===
                "https://queue.fal.run/sonilo/v1.1/video-to-sound-effects",
        );
        expect(JSON.parse(String(submit?.[1]?.body))).toEqual({
            video_url: options.referenceVideo,
            prompt: options.prompt,
            audio_format: "mp3",
        });
        const usage = parseUsageHeaders(response.headers);
        expect(usage).toMatchObject({ completionAudioSeconds: 12 });
        const providerBilling = {
            units: Number(response.headers.get(PROVIDER_BILLING_HEADERS.units)),
            unitCost: Number(
                response.headers.get(PROVIDER_BILLING_HEADERS.unitCost),
            ),
        };
        expect(providerBilling).toEqual({ units: 12, unitCost: 0.009 });
        const billed = calculateUsageBilling({
            model: SONILO_MODEL,
            usage,
            servedBy: AUDIO_SERVICES[SONILO_MODEL],
            input: { providerBilling },
        });
        expect(billed.price.totalPrice).toBeCloseTo(0.108, 9);
    });

    it("rejects an output larger than 64 MB", async () => {
        vi.useFakeTimers();
        mockFal(
            () =>
                new Response("ID3", {
                    headers: { "content-length": String(64 * 1024 * 1024 + 1) },
                }),
        );
        const pending = generateSoniloSfx(options);
        const assertion = expect(pending).rejects.toMatchObject({
            status: 502,
        });
        await vi.advanceTimersByTimeAsync(5000);
        await assertion;
    });

    it.each([
        { referenceVideo: undefined },
        { referenceVideo: "http://127.0.0.1/clip.mp4" },
        { responseFormat: "wav" },
    ])("rejects %j before starting a billable job", async (unsupported) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            generateSoniloSfx({ ...options, ...unsupported }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

fixtureTest(
    "reads reference_video from a multipart speech request",
    async ({ paidApiKey }) => {
        const formData = new FormData();
        formData.append("model", SONILO_MODEL);
        formData.append("input", "rain on a tin roof");
        // A private URL stops the request before any fal job, so the message
        // shows the multipart value reached Sonilo.
        formData.append("reference_video", "http://127.0.0.1/clip.mp4");

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://staging.gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: formData,
            }),
            withInlineGenerationCoordinator(
                env as unknown as CloudflareBindings,
            ),
            ctx,
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message:
                    "reference_video must be a public HTTP(S) URL without credentials",
            },
        });
        await waitOnExecutionContext(ctx);
    },
);
