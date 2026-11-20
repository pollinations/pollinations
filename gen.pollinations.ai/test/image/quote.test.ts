import { IMAGE_SERVICES, type ImageModelName } from "@shared/registry/image.ts";
import {
    calculatePrice,
    getVisibleImageModels,
    type PricingInput,
    type Usage,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";
import { quoteMediaRequest } from "../../src/image/quote.ts";

/** The quote for a request as the media routes would parse it. */
function quote(model: ImageModelName, options: Record<string, unknown> = {}) {
    return quoteMediaRequest(
        model,
        IMAGE_SERVICES[model],
        ImageParamsSchema.parse({ model, ...options }),
    );
}

/** What billing charges for this usage on the same model. */
const billed = (model: ImageModelName, usage: Usage, input?: PricingInput) =>
    calculatePrice(model, usage, undefined, input).totalPrice;

const referenceVideo = "https://example.com/clip.mp4";
const referenceImage = "https://example.com/frame.png";

describe("quoteMediaRequest", () => {
    it("quotes a flat-rate image at the billed price of one image", () => {
        expect(quote("tongyi-mai/z-image-turbo")).toBe(
            billed("tongyi-mai/z-image-turbo", { completionImageTokens: 1 }),
        );
    });

    it("quotes video by its seconds, with sound only when asked for", () => {
        const model = "google/veo-3.1-fast";
        const silent = billed(model, { completionVideoSeconds: 8 });
        const withSound = billed(model, {
            completionVideoSeconds: 8,
            completionAudioSeconds: 8,
        });

        expect(quote(model, { duration: 8 })).toBe(silent);
        expect(quote(model, { duration: 8, audio: false })).toBe(silent);
        expect(quote(model, { duration: 8, audio: true })).toBe(withSound);
        expect(withSound).toBeGreaterThan(silent);
    });

    it("uses the model's default duration when none is given", () => {
        const model = "google/veo-3.1-fast";
        expect(quote(model)).toBe(
            billed(model, {
                completionVideoSeconds: IMAGE_SERVICES[model].defaultDuration,
            }),
        );
    });

    it("quotes the seconds the provider bills when a clip is shorter", () => {
        // OpenRouter bills at least 5 seconds per HappyHorse clip.
        const model = "alibaba/happyhorse-1.1";
        const fiveSeconds = billed(model, { completionVideoSeconds: 5 });

        expect(quote(model, { duration: 3 })).toBe(fiveSeconds);
        expect(quote(model, { duration: 5 })).toBe(fiveSeconds);
        expect(quote(model, { duration: 8 })).toBe(
            billed(model, { completionVideoSeconds: 8 }),
        );
    });

    it("applies the rate sheet billing selects for the resolution", () => {
        const model = "google/veo-3.1-fast";
        const usage = { completionVideoSeconds: 8 };
        const at1080p = billed(model, usage, { resolution: "1080p" });

        expect(quote(model, { duration: 8, resolution: "1080p" })).toBe(
            at1080p,
        );
        expect(at1080p).toBeGreaterThan(billed(model, usage));
    });

    it("applies the rate sheets for a start image and a reference video", () => {
        expect(
            quote("alibaba/wan-2.7", {
                duration: 5,
                resolution: "1080p",
                image: referenceImage,
            }),
        ).toBe(
            billed(
                "alibaba/wan-2.7",
                { completionVideoSeconds: 5 },
                { resolution: "1080p", hasImage: true },
            ),
        );
        expect(
            quote("bytedance/seedance-2.0", {
                duration: 10,
                reference_videos: referenceVideo,
            }),
        ).toBe(
            billed(
                "bytedance/seedance-2.0",
                { completionVideoSeconds: 10 },
                { hasReferenceVideo: true },
            ),
        );
    });

    it("adds the per-image fee for each reference image", () => {
        const model = "x-ai/grok-imagine-image-2.0";
        expect(
            quote(model, {
                quality: "low",
                resolution: "2k",
                image: [referenceImage, referenceImage],
            }),
        ).toBe(
            billed(
                model,
                { completionImageTokens: 1, promptImageTokens: 2 },
                { quality: "low", resolution: "2k", hasImage: true },
            ),
        );
    });

    it("gives no price when tokens set the charge", () => {
        expect(quote("openai/gpt-image-2")).toBeUndefined();
        expect(quote("google/gemini-3.1-flash-image")).toBeUndefined();
        expect(quote("google/gemini-omni-1.2-flash")).toBeUndefined();
    });

    it("gives no price when the provider meters the output", () => {
        expect(quote("black-forest-labs/flux.2-pro")).toBeUndefined();
        expect(quote("qwen/qwen-image-2.1")).toBeUndefined();
        expect(quote("minimax/minimax-h3-max")).toBeUndefined();
    });

    it("gives no price when the reference media sets the charge", () => {
        const withVideo = { reference_videos: referenceVideo };

        expect(quote("mirelo/sfx-2.0", withVideo)).toBeUndefined();
        expect(quote("bytedance/seedance-2.5", withVideo)).toBeUndefined();
        expect(quote("alibaba/wan-3.0", withVideo)).toBeUndefined();
        expect(
            quote("black-forest-labs/flux.2-pro", { image: referenceImage }),
        ).toBeUndefined();
        // The same models are quotable when the options alone set the length.
        expect(quote("bytedance/seedance-2.5")).toBeGreaterThan(0);
        expect(quote("alibaba/wan-3.0")).toBeGreaterThan(0);
    });

    it("never quotes a listed model at zero", () => {
        for (const model of getVisibleImageModels()) {
            const options = model === "heygen/heygen-avatar-6-turbo"
                ? { image: [referenceImage], reference_audios: ["https://example.com/speech.mp3"] }
                : {};
            expect(quote(model, options) ?? 1, model).toBeGreaterThan(0);
        }
    });
});
