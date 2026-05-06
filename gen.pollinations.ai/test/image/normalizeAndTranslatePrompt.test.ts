import { expect, test } from "vitest";
import { normalizeAndTranslatePrompt } from "../../src/image/normalizeAndTranslatePrompt.ts";
import type { ImageParams } from "../../src/image/params.ts";

const baseParams: ImageParams = {
    width: 1024,
    height: 1024,
    seed: 42,
    model: "zimage",
    enhance: false,
    negative_prompt: "worst quality, blurry",
    nofeed: false,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
};

test("does not infer prompt enhancement from accept-language", async () => {
    const timingInfo: Array<{ step: string; timestamp: number }> = [];

    const result = await normalizeAndTranslatePrompt(
        "un paisaje",
        { headers: { "accept-language": "es-ES,es;q=0.9" }, url: "/" },
        timingInfo,
        baseParams,
    );

    expect(result).toMatchObject({
        prompt: "un paisaje",
        wasPimped: false,
    });
});

test("memoized prompt normalization keeps enhance mode separate", async () => {
    const request = { headers: {}, url: "/" };

    const plain = await normalizeAndTranslatePrompt(
        "same prompt",
        request,
        [],
        baseParams,
    );
    const enhanced = await normalizeAndTranslatePrompt(
        "same prompt",
        request,
        [],
        { ...baseParams, enhance: true },
    );

    expect(plain.wasPimped).toBe(false);
    expect(enhanced.wasPimped).toBe(true);
});
