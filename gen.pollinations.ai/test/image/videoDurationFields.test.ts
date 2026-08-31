import {
    getImageModelIds,
    getVideoModelIds,
    IMAGE_SERVICES,
    type ImageModelName,
} from "@shared/registry/image.ts";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { describe, expect, it } from "vitest";

const videoModelIds = getVideoModelIds() as ImageModelName[];
const nonVideoModelIds = getImageModelIds() as ImageModelName[];

describe("video duration registry fields", () => {
    it.each(videoModelIds)(
        "%s has min_duration, max_duration, and default_duration",
        (name) => {
            const info = modelInfoFromDefinition(name, IMAGE_SERVICES[name]);
            expect(info.min_duration).toBeGreaterThan(0);
            expect(info.max_duration).toBeGreaterThan(0);
            expect(info.default_duration).toBeGreaterThan(0);
        },
    );

    it.each(videoModelIds)("%s satisfies min ≤ default ≤ max", (name) => {
        const info = modelInfoFromDefinition(name, IMAGE_SERVICES[name]);
        const min = info.min_duration ?? 0;
        const def = info.default_duration ?? 0;
        const max = info.max_duration ?? 0;
        expect(min).toBeLessThanOrEqual(def);
        expect(def).toBeLessThanOrEqual(max);
    });

    it.each(nonVideoModelIds)("%s omits duration fields", (name) => {
        const info = modelInfoFromDefinition(name, IMAGE_SERVICES[name]);
        expect(info.min_duration).toBeUndefined();
        expect(info.max_duration).toBeUndefined();
        expect(info.default_duration).toBeUndefined();
    });

    it("veo exposes allowed_durations", () => {
        const info = modelInfoFromDefinition("veo", IMAGE_SERVICES.veo);
        expect(info.allowed_durations).toEqual([4, 6, 8]);
    });

    it("wan exposes allowed_durations", () => {
        const info = modelInfoFromDefinition("wan", IMAGE_SERVICES.wan);
        expect(info.allowed_durations).toEqual([5, 10, 15]);
    });

    it("nova-reel exposes duration_step", () => {
        const info = modelInfoFromDefinition(
            "nova-reel",
            IMAGE_SERVICES["nova-reel"],
        );
        expect(info.duration_step).toBe(6);
    });
});
