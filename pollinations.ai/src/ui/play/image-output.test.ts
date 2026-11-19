import { describe, expect, it } from "vitest";
import { playgroundModelOverride } from "../../data/playground-model-overrides";
import {
    type ImageFormats,
    imageOutput,
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
    it("uses the local GIF metadata until the catalog publishes its own entry", () => {
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
        expect(published?.gif).toEqual(catalog.gif);
        expect(published?.png.mode).toBe("default");
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
