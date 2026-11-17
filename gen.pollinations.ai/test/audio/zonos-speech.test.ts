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
