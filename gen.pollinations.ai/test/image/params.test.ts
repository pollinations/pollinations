import { CreateImageRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import {
    ImageParamsSchema,
    logNonStrictBooleanParams,
} from "../../src/image/params.ts";
import { SENTINEL_SEED } from "../../src/util.ts";

describe("ImageParamsSchema", () => {
    it("normalizes seed -1 to the sentinel seed", () => {
        const result = ImageParamsSchema.parse({
            model: "black-forest-labs/flux.1-schnell",
            seed: -1,
        });

        expect(result.seed).toBe(SENTINEL_SEED);
    });

    it("rejects transparent backgrounds for gpt-image-2", () => {
        const result = ImageParamsSchema.safeParse({
            model: "openai/gpt-image-2",
            transparent: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["transparent"],
                message:
                    "Transparent backgrounds are not supported by gpt-image-2.",
            });
        }
    });

    it("keeps transparent backgrounds available for gptimage models", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "openai/gpt-image-1-mini",
                transparent: true,
            }).success,
        ).toBe(true);
    });

    it("accepts resolutions declared by the model", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "google/veo-3.1-fast",
                resolution: "1080p",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "bytedance/seedance-1-pro-fast",
                resolution: "480p",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "x-ai/grok-imagine-image-2.0",
                resolution: "2k",
                quality: "low",
            }).success,
        ).toBe(true);
        for (const resolution of ["480p", "768p", "2k"] as const) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "minimax/minimax-h3",
                    resolution,
                }).success,
            ).toBe(true);
        }
        for (const resolution of ["480p", "768p", "1080p"] as const) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "minimax/minimax-h3-max",
                    resolution,
                }).success,
            ).toBe(true);
            expect(
                ImageParamsSchema.safeParse({
                    model: "minimax/minimax-h3-max-turbo",
                    resolution,
                }).success,
            ).toBe(true);
        }
    });

    it("accepts the one resolution a fixed-resolution video model produces", () => {
        for (const [model, resolution] of [
            ["alibaba/happyhorse-1.1", "720p"],
            ["bytedance/seedance-2.0", "720p"],
            ["alibaba/wan-2.2-fast", "480p"],
            ["x-ai/grok-imagine-video", "720p"],
            ["alibaba/wan-2.6", "720p"],
        ] as const) {
            expect(
                ImageParamsSchema.safeParse({ model, resolution }).success,
            ).toBe(true);
        }
    });

    it("leaves audio unset when the caller omits it", () => {
        const parse = (audio?: string) =>
            ImageParamsSchema.parse({ model: "google/veo-3.1-fast", audio })
                .audio;
        expect(parse()).toBeUndefined();
        expect(parse("false")).toBe(false);
        expect(parse("true")).toBe(true);
    });

    it("accepts 768p on the OpenAI-compatible image route", () => {
        expect(
            CreateImageRequestSchema.safeParse({
                model: "minimax/minimax-h3",
                prompt: "a red wind-up robot",
                resolution: "768p",
            }).success,
        ).toBe(true);
    });

    it("rejects native-only reference media on OpenAI POST requests", () => {
        for (const field of [
            "reference_images",
            "reference_videos",
            "reference_audios",
        ] as const) {
            const result = CreateImageRequestSchema.safeParse({
                model: "seedance-2.0",
                prompt: "a paper boat",
                [field]: ["https://media.example/reference.bin"],
            });

            expect(result.success, field).toBe(false);
        }
    });

    it("enforces the public minimax-h3 contract", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                duration: 6,
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                aspectRatio: "9:16",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3",
                fps: 30,
            }).success,
        ).toBe(false);
    });

    it.each([
        "minimax/minimax-h3-max",
        "minimax/minimax-h3-max-turbo",
    ] as const)("enforces the public %s contract", (model) => {
        for (const duration of [5, 10, 15]) {
            expect(
                ImageParamsSchema.safeParse({
                    model,
                    duration,
                }).success,
            ).toBe(true);
        }
        for (const params of [
            { duration: 6 },
            { resolution: "2k" },
            { aspectRatio: "9:21" },
            { fps: 30 },
        ]) {
            expect(
                ImageParamsSchema.safeParse({
                    model,
                    ...params,
                }).success,
            ).toBe(false);
        }
    });

    it("bounds video duration for every public route", () => {
        for (const duration of [1, 120]) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "black-forest-labs/flux.1-schnell",
                    duration,
                }).success,
            ).toBe(true);
        }
        for (const duration of [0, 1.5, 121, 1e308]) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "black-forest-labs/flux.1-schnell",
                    duration,
                }).success,
                String(duration),
            ).toBe(false);
        }
    });

    it("enforces the public Gemini Omni 1.1 Flash contract", () => {
        for (const resolution of ["360p", "720p", "1080p", "4k"] as const) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "google/gemini-omni-1.1-flash",
                    resolution,
                }).success,
            ).toBe(true);
        }
        for (const params of [{ aspectRatio: "1:1" }, { fps: 30 }]) {
            expect(
                ImageParamsSchema.safeParse({
                    model: "google/gemini-omni-1.1-flash",
                    ...params,
                }).success,
            ).toBe(false);
        }
    });

    it("rejects unsupported Grok Imagine Image 2.0 quality", () => {
        const result = ImageParamsSchema.safeParse({
            model: "x-ai/grok-imagine-image-2.0",
            quality: "high",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["quality"],
                message:
                    "grok-imagine-image-2.0 supports low or medium quality.",
            });
        }
    });

    it("does not silently upgrade invalid Grok Imagine Image 2.0 quality", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "x-ai/grok-imagine-image-2.0",
                quality: "LOW",
            }).success,
        ).toBe(false);
        expect(
            ImageParamsSchema.parse({
                model: "black-forest-labs/flux.1-schnell",
                quality: "LOW",
            }).quality,
        ).toBe("medium");
    });

    it("rejects an unsupported resolution", () => {
        const result = ImageParamsSchema.safeParse({
            model: "google/veo-3.1-fast",
            resolution: "480p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    'Resolution "480p" is not supported by google/veo-3.1-fast. Supported: 720p, 1080p.',
            });
        }
    });

    it("rejects resolution on models without resolution tiers", () => {
        const result = ImageParamsSchema.safeParse({
            model: "black-forest-labs/flux.1-schnell",
            resolution: "720p",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]).toMatchObject({
                path: ["resolution"],
                message:
                    "black-forest-labs/flux.1-schnell does not accept a resolution parameter.",
            });
        }
    });

    it("parses and validates reference media independently from frame images", () => {
        const result = ImageParamsSchema.safeParse({
            model: "bytedance/seedance-2.0",
            reference_images:
                "https://media.example/image,a.png| |https://media.example/image-b.png|",
            reference_videos: "https://media.example/video.mp4",
            reference_audios: "https://media.example/audio.mp3",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.reference_images).toEqual([
                "https://media.example/image,a.png",
                "https://media.example/image-b.png",
            ]);
            expect(result.data.reference_videos).toEqual([
                "https://media.example/video.mp4",
            ]);
        }
    });

    it("rejects reference media on unsupported models", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "bytedance/seedance-2.0-mini",
                reference_images: "https://media.example/image.png",
            }).success,
        ).toBe(false);
    });

    it("accepts reference media on minimax-h3-max and rejects on turbo", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3-max",
                reference_videos: "https://media.example/video.mp4",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "minimax/minimax-h3-max-turbo",
                reference_videos: "https://media.example/video.mp4",
            }).success,
        ).toBe(false);
    });

    it("passes provider-specific reference combinations through", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "bytedance/seedance-2.0",
                image: "https://media.example/frame.png",
                reference_images: "https://media.example/image.png",
            }).success,
        ).toBe(true);
        expect(
            ImageParamsSchema.safeParse({
                model: "bytedance/seedance-2.0",
                reference_audios: "https://media.example/audio.mp3",
            }).success,
        ).toBe(true);
    });

    it("rejects unsafe reference media URLs", () => {
        const invalidUrl = ImageParamsSchema.safeParse({
            model: "bytedance/seedance-2.5",
            reference_images: "http://127.0.0.1/image.png",
        });
        expect(invalidUrl.success).toBe(false);
    });

    it("accepts inferenceport-ai/lightning-image-turbo", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "inferenceport-ai/lightning-image-turbo",
            }).success,
        ).toBe(true);
    });

    it("rejects an unregistered short model name", () => {
        const result = ImageParamsSchema.safeParse({
            model: "lightning-image-turbo",
        });
        expect(result.success).toBe(false);
    });

    it("parses two image references for lightning-image-turbo", () => {
        expect(
            ImageParamsSchema.safeParse({
                model: "inferenceport-ai/lightning-image-turbo",
                image: [
                    "https://example.com/a.png",
                    "https://example.com/b.png",
                ],
            }).success,
        ).toBe(true);
    });

    it("rejects resolution on lightning-image-turbo", () => {
        const result = ImageParamsSchema.safeParse({
            model: "inferenceport-ai/lightning-image-turbo",
            resolution: "720p",
        });
        expect(result.success).toBe(false);
    });
});

describe("logNonStrictBooleanParams (#16854 measurement)", () => {
    const fakeLog = () => {
        const calls: { message: string; fields?: Record<string, unknown> }[] =
            [];
        return {
            calls,
            warn(message: string, fields?: Record<string, unknown>) {
                calls.push({ message, fields });
            },
        };
    };
    const offendersOf = (log: ReturnType<typeof fakeLog>) =>
        log.calls[0]?.fields?.offenders as Record<string, unknown>[];

    it("logs unrecognized values in the unrecognized bucket", () => {
        const log = fakeLog();
        logNonStrictBooleanParams({ safe: "maybe" }, log);
        expect(log.calls).toHaveLength(1);
        expect(log.calls[0].fields?.event).toBe(
            "image.boolean_param_non_strict",
        );
        expect(offendersOf(log)).toEqual([
            {
                param: "safe",
                rawValue: "maybe",
                valueType: "string",
                bucket: "unrecognized",
            },
        ]);
    });

    it("logs recognized non-strict tokens in the non-strict-token bucket", () => {
        for (const [param, value] of [
            ["safe", "1"],
            ["transparent", "yes"],
            ["audio", "off"],
            ["safe", ""],
        ] as const) {
            const log = fakeLog();
            logNonStrictBooleanParams({ [param]: value }, log);
            expect(offendersOf(log)).toEqual([
                {
                    param,
                    rawValue: value,
                    valueType: "string",
                    bucket: "non-strict-token",
                },
            ]);
        }
    });

    it("treats trim/case variants as non-strict (OpenRouter rejects them)", () => {
        for (const value of ["TRUE", " true "]) {
            const log = fakeLog();
            logNonStrictBooleanParams({ safe: value }, log);
            expect(offendersOf(log)[0]?.bucket).toBe("non-strict-token");
        }
    });

    it("classifies numbers as non-strict tokens", () => {
        for (const value of [0, 1, 2]) {
            const log = fakeLog();
            logNonStrictBooleanParams({ safe: value }, log);
            expect(offendersOf(log)).toEqual([
                {
                    param: "safe",
                    rawValue: String(value),
                    valueType: "number",
                    bucket: "non-strict-token",
                },
            ]);
        }
    });

    it("stays silent for strict values and absent params", () => {
        const log = fakeLog();
        logNonStrictBooleanParams(
            { safe: true, transparent: false, audio: "true" },
            log,
        );
        logNonStrictBooleanParams({ safe: "false" }, log);
        logNonStrictBooleanParams({}, log);
        expect(log.calls).toHaveLength(0);
    });

    it("counts an explicit null as a sent unrecognized value", () => {
        const log = fakeLog();
        logNonStrictBooleanParams({ safe: null }, log);
        expect(offendersOf(log)).toEqual([
            {
                param: "safe",
                rawValue: "null",
                valueType: "object",
                bucket: "unrecognized",
            },
        ]);
    });

    it("renders arrays and objects as fixed placeholders", () => {
        const log = fakeLog();
        logNonStrictBooleanParams({ safe: [], transparent: {} }, log);
        expect(offendersOf(log)).toEqual([
            {
                param: "safe",
                rawValue: "[array]",
                valueType: "array",
                bucket: "unrecognized",
            },
            {
                param: "transparent",
                rawValue: "[object]",
                valueType: "object",
                bucket: "unrecognized",
            },
        ]);
    });

    it("truncates long values to 32 chars", () => {
        const log = fakeLog();
        logNonStrictBooleanParams({ safe: "x".repeat(100) }, log);
        expect(offendersOf(log)[0]?.rawValue).toBe("x".repeat(32));
    });

    it("emits a single event for multiple offenders", () => {
        const log = fakeLog();
        logNonStrictBooleanParams(
            { safe: "1", transparent: "banana", audio: true },
            log,
        );
        expect(log.calls).toHaveLength(1);
        expect(offendersOf(log).map((o) => o.bucket)).toEqual([
            "non-strict-token",
            "unrecognized",
        ]);
    });

    it("never throws, even on pathological input", () => {
        const evil = Object.create(null, {
            safe: {
                get() {
                    throw new Error("boom");
                },
            },
        }) as Record<string, unknown>;
        const log = fakeLog();
        expect(() => logNonStrictBooleanParams(evil, log)).not.toThrow();
        expect(log.calls).toHaveLength(0);
    });

    it("bounds bigint, symbol and function representations too", () => {
        const log = fakeLog();
        logNonStrictBooleanParams(
            {
                safe: 12345678901234567890123456789012345678901234567890n,
                transparent: Symbol("x".repeat(100)),
                audio: function handler() {},
            },
            log,
        );
        for (const offender of offendersOf(log)) {
            expect(String(offender.rawValue).length).toBeLessThanOrEqual(32);
            expect(offender.bucket).toBe("unrecognized");
        }
    });

    it("classifies NaN, infinities and negatives as non-strict tokens", () => {
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
            const log = fakeLog();
            logNonStrictBooleanParams({ safe: value }, log);
            expect(offendersOf(log)[0]?.bucket).toBe("non-strict-token");
        }
    });

    it("treats an explicit undefined like absence", () => {
        const log = fakeLog();
        logNonStrictBooleanParams({ safe: undefined }, log);
        expect(log.calls).toHaveLength(0);
    });

    it("parsing is unchanged even when the logger throws", () => {
        const throwing = {
            warn() {
                throw new Error("logging is down");
            },
        };
        logNonStrictBooleanParams({ safe: "1" }, throwing);
        // Same coercion as before instrumentation.
        const result = ImageParamsSchema.parse({
            model: "black-forest-labs/flux.1-schnell",
            safe: "1",
        });
        expect(result.safe).toBe(false);
    });
});
