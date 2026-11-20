import { describe, expect, it } from "vitest";
import { playgroundModelOverride } from "../../data/playground-model-overrides";
import {
    type ImageFormats,
    imageActionLabel,
    imageOutput,
    imageResult,
    previewImageFormats,
} from "./image-output";

describe("image output selection", () => {
    const catalog: ImageFormats = {
        gif: {
            mode: "selectable",
            input_modalities: ["text"],
            frame_defaults: { frame_count: 6, frame_duration_ms: 150 },
        },
    };
    it.each(["png", "svg"] as const)(
        "keeps the edit action for %s output",
        (format) => {
            expect(imageActionLabel(true, format)).toBe("Edit image");
            expect(imageActionLabel(false, format)).toBe(
                `Generate ${format.toUpperCase()}`,
            );
        },
    );
    it("uses the local GIF metadata until the catalog publishes its format list", () => {
        const model = { name: "openai/gpt-image-2.6-flare", paid_only: true };
        const preview = playgroundModelOverride(model.name)?.imageFormats;
        const local = previewImageFormats(model, preview);
        expect(imageOutput(local, "gif").request).toEqual({
            outputFormat: "gif",
            frameCount: 8,
            frameDurationMs: 120,
        });
        const published = previewImageFormats(
            { ...model, output_formats: catalog },
            preview,
        );
        expect(published).toEqual(catalog);
        expect(
            previewImageFormats({ ...model, output_formats: {} }, preview),
        ).toEqual({});
    });
    it("keeps the normal image request until an advertised format is selected", () => {
        const still = imageOutput(catalog);
        expect(still.options).toEqual(["still", "gif"]);
        expect(still.request).toBeUndefined();
        expect(still.info).toBeUndefined();
        expect(imageOutput(catalog, "gif")).toMatchObject({
            format: "gif",
            info: { input_modalities: ["text"] },
            request: {
                outputFormat: "gif",
                frameCount: 6,
                frameDurationMs: 150,
            },
        });
    });
    it.each(["gif", "svg"])(
        "shows native %s as fixed and leaves it out of the request",
        (format) => {
            expect(
                imageOutput(
                    {
                        [format]: {
                            mode: "native",
                            input_modalities: ["text"],
                        },
                    },
                    "still",
                ),
            ).toMatchObject({ options: [format], format, request: undefined });
        },
    );
    it("ignores stale selections when a model does not advertise the format", () => {
        expect(imageOutput(undefined, "gif")).toMatchObject({
            options: [],
            format: undefined,
            request: undefined,
        });
        expect(imageOutput(catalog, "svg").request).toBeUndefined();
    });
});

describe("returned image", () => {
    const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    it("retains the bytes and labels the download using the returned format", async () => {
        const result = imageResult(
            { buffer, contentType: "image/JPEG; quality=90" },
            "webp",
        );
        try {
            expect(result.filename).toBe("pollinations-playground.jpg");
            expect(result.formatLabel).toBe("JPEG");
            expect(result.notice).toBe(
                "Requested WebP. The model returned JPEG.",
            );
            const preview = await fetch(result.url);
            expect(preview.headers.get("Content-Type")).toBe("image/jpeg");
            expect(await preview.arrayBuffer()).toEqual(buffer);
        } finally {
            URL.revokeObjectURL(result.url);
        }
    });
    it.each(["jpeg", undefined] as const)(
        "omits the notice for a matching or unspecified format (%s)",
        (expected) => {
            const result = imageResult(
                { buffer, contentType: "image/jpeg" },
                expected,
            );
            try {
                expect(result.notice).toBeUndefined();
            } finally {
                URL.revokeObjectURL(result.url);
            }
        },
    );
    it("rejects a non-image response", () => {
        expect(() =>
            imageResult({ buffer, contentType: "text/html" }, "gif"),
        ).toThrow("Expected an image");
    });
});
