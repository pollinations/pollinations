import type { ModelInfo } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import { imageOutput } from "./image-output";

describe("image output selection", () => {
    const catalog: ModelInfo["output_formats"] = {
        gif: {
            mode: "selectable",
            input_modalities: ["text"],
            frame_defaults: { frame_count: 6, frame_duration_ms: 150 },
        },
    };
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
