import {
    getImageModelIds,
    getVideoModelIds,
    IMAGE_SERVICES,
    type ImageModelName,
} from "@shared/registry/image.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "../../src/image/params.ts";

const mediaModelIds = [
    ...getImageModelIds(),
    ...getVideoModelIds(),
] as ImageModelName[];
const info = (name: ImageModelName) =>
    modelInfoFromDefinition(name, IMAGE_SERVICES[name]);
const pixels = (size: string) => {
    const [width, height] = size.split("x").map(Number);
    return { width, height };
};

describe("aspect_ratios", () => {
    it.each(
        mediaModelIds,
    )("%s only lists ratios the gateway accepts", (name) => {
        for (const aspectRatio of info(name).aspect_ratios ?? []) {
            const result = ImageParamsSchema.safeParse({
                model: name,
                aspectRatio,
            });
            expect(result.success, `${name} ${aspectRatio}`).toBe(true);
        }
    });
});

describe("image_size", () => {
    it.each(
        getVideoModelIds() as ImageModelName[],
    )("%s omits image_size", (name) => {
        expect(info(name).image_size).toBeUndefined();
    });

    it.each(
        getImageModelIds() as ImageModelName[],
    )("%s describes one consistent size mode", (name) => {
        const size = info(name).image_size;
        if (!size) return;
        const limits = [
            size.min_side,
            size.max_side,
            size.multiple_of,
            size.min_pixels,
            size.max_pixels,
            size.max_aspect_ratio,
        ];
        if (size.default) expect(size.default).toMatch(/^\d+x\d+$/);

        if (size.mode === "presets" || size.mode === "fixed") {
            expect(size.sizes?.length).toBeGreaterThan(0);
            for (const preset of size.sizes ?? []) {
                expect(preset).toMatch(/^\d+x\d+$/);
            }
            if (size.default) expect(size.sizes).toContain(size.default);
            expect(limits.every((limit) => limit === undefined)).toBe(true);
            return;
        }

        expect(size.sizes).toBeUndefined();
        if (size.mode === "provider") {
            expect(limits.every((limit) => limit === undefined)).toBe(true);
            return;
        }

        // Pixels: the default output must satisfy the published limits.
        if (!size.default) return;
        const { width, height } = pixels(size.default);
        for (const side of [width, height]) {
            expect(side).toBeGreaterThanOrEqual(size.min_side ?? 0);
            expect(side).toBeLessThanOrEqual(size.max_side ?? side);
            expect(side % (size.multiple_of ?? 1)).toBe(0);
        }
        expect(width * height).toBeGreaterThanOrEqual(size.min_pixels ?? 0);
        expect(width * height).toBeLessThanOrEqual(
            size.max_pixels ?? width * height,
        );
        expect(
            Math.max(width, height) / Math.min(width, height),
        ).toBeLessThanOrEqual(
            size.max_aspect_ratio ?? Number.POSITIVE_INFINITY,
        );
    });
});
