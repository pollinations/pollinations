import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { calculatePrice } from "@shared/registry/registry.ts";
import { createAudioTokenUsage } from "@shared/registry/usage-headers.ts";
import { expect, it } from "vitest";
import { generateZonosSpeech } from "../../src/routes/zonos-speech.ts";

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

it("forwards the reference recording and labels the generated voice", async () => {
    const clip = new File([new Uint8Array([1, 2, 3])], "voice.wav", {
        type: "audio/wav",
    });
    const binding = {
        async fetch(url: string, init: RequestInit) {
            const form = await new Request(url, init).formData();
            expect(form.get("text")).toBe("Hello");
            expect(form.get("format")).toBe("mp3");
            const reference = form.get("reference_audio") as File;
            expect(reference.type).toBe(clip.type);
            expect(await reference.arrayBuffer()).toEqual(
                await clip.arrayBuffer(),
            );
            return new Response();
        },
    } as Fetcher;
    const result = await generateZonosSpeech(
        binding,
        "Hello",
        "alloy",
        "mp3",
        clip,
    );
    expect(result.headers.get("x-tts-voice")).toBe("reference_audio");
});
