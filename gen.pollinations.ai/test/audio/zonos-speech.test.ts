import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { calculatePrice } from "@shared/registry/registry.ts";
import { createAudioTokenUsage } from "@shared/registry/usage-headers.ts";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import { generateZonosSpeech } from "../../src/routes/zonos-speech.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const model = "zyphra/zonos3-mini";

it("limits ZONOS speech to the paid POST endpoint and meters input bytes", () => {
    const definition = AUDIO_SERVICES[model];
    expect(definition.paidOnly).toBe(true);
    expect(definition.supportedEndpoints).toEqual(["/v1/audio/speech"]);
    expect(definition.priceUnits.completionAudioTokens.unit).toBe("byte");
    const usage = createAudioTokenUsage(
        new TextEncoder().encode("Café").length,
    );
    expect(usage.completionAudioTokens).toBe(5);
    expect(calculatePrice(model, usage).totalPrice).toBeCloseTo(0.000025, 10);
});

it("rejects unsupported encodings and reports an unbound backend as unavailable", async () => {
    await expect(
        generateZonosSpeech(undefined, "Hello", "alloy", "wav"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
        generateZonosSpeech(undefined, "Hello", "alloy", "pcm"),
    ).rejects.toMatchObject({ status: 503 });
});

workerTest(
    "POST /v1/audio/speech forwards a ZONOS reference to the GPU",
    async ({ paidApiKey }) => {
        const referenceUrl = "https://media.pollinations.ai/test-voice";
        const referenceBytes = new Uint8Array([1, 2, 3]);
        const outputBytes = new Uint8Array([4, 5, 6]);
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input, init) => {
                const url = new Request(input, init).url;
                if (url === referenceUrl)
                    return new Response(referenceBytes, {
                        headers: { "Content-Type": "audio/wav" },
                    });
                if (
                    url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/",
                    ) ||
                    url.startsWith("http://localhost:7181/")
                )
                    return Response.json({ data: [] });
                throw new Error(`Unexpected fetch: ${url}`);
            });
        const binding = {
            async fetch(url: string, init: RequestInit) {
                const form = await new Request(url, init).formData();
                expect(form.get("text")).toBe("Hello");
                expect(form.get("format")).toBe("mp3");
                const reference = form.get("reference_audio") as File;
                expect(reference.type).toBe("audio/wav");
                expect(new Uint8Array(await reference.arrayBuffer())).toEqual(
                    referenceBytes,
                );
                return new Response(outputBytes);
            },
        } as Fetcher;
        const ctx = createExecutionContext();
        try {
            const response = await worker.fetch(
                new Request("https://gen.pollinations.ai/v1/audio/speech", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model,
                        input: "Hello",
                        reference_audio: referenceUrl,
                    }),
                }),
                withInlineGenerationCoordinator({
                    ...env,
                    ZONOS3_VPC: binding,
                }),
                ctx,
            );
            expect(response.status).toBe(200);
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(
                outputBytes,
            );
            expect(response.headers.get("x-tts-voice")).toBe("reference_audio");
        } finally {
            await waitOnExecutionContext(ctx);
            fetch.mockRestore();
        }
    },
);
