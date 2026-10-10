import { describe, expect, it } from "vitest";
import {
    type MediaModelMetadata,
    mediaModelSettings,
} from "./media-model-settings";

const empty: MediaModelMetadata = {
    resolutions: [],
    allowedDurations: [],
    videoCapabilities: [],
};

describe("catalog-only media settings", () => {
    it("does not turn a saved selection or catalog default into an invented limit", () => {
        const saved = { resolution: "4k", duration: 10 };
        expect(mediaModelSettings(undefined, saved)).toEqual({
            resolution: undefined,
            duration: undefined,
        });
        expect(
            mediaModelSettings({ ...empty, defaultDuration: 5 }, saved)
                .duration,
        ).toBeUndefined();
        expect(
            mediaModelSettings({ ...empty, minDuration: 1 }, saved).duration,
        ).toBeUndefined();
        expect(
            mediaModelSettings({ ...empty, maxDuration: 10 }, saved).duration,
        ).toBeUndefined();
    });

    it("uses only listed resolutions, preserving the first as the API default", () => {
        const model = { ...empty, resolutions: ["720p", "480p", "1080p"] };
        expect(mediaModelSettings(model).resolution).toBe("720p");
        expect(
            mediaModelSettings(model, { resolution: "1080p" }).resolution,
        ).toBe("1080p");
        expect(mediaModelSettings(model, { resolution: "4k" }).resolution).toBe(
            "720p",
        );
    });

    it("supports fixed resolutions and durations without inventing additional choices", () => {
        const settings = mediaModelSettings(
            { ...empty, resolutions: ["480p"], minDuration: 4, maxDuration: 4 },
            { duration: 15 },
        );
        expect(settings.resolution).toBe("480p");
        expect(settings.duration).toMatchObject({ min: 4, max: 4, value: 4 });
    });

    it("honors discrete values rather than accepting every second in their range", () => {
        const model = {
            ...empty,
            allowedDurations: [15, 5, 10],
            defaultDuration: 10,
        };
        expect(mediaModelSettings(model, { duration: 12 }).duration).toEqual({
            min: 5,
            max: 15,
            options: [5, 10, 15],
            step: 1,
            value: 10,
        });
        expect(
            mediaModelSettings(model, { duration: 15 }).duration?.value,
        ).toBe(15);
        expect(model.allowedDurations).toEqual([15, 5, 10]);
    });

    it("honors declared duration steps and replaces stale out-of-range values", () => {
        const model = {
            ...empty,
            minDuration: 6,
            maxDuration: 120,
            durationStep: 6,
            defaultDuration: 12,
        };
        expect(mediaModelSettings(model, { duration: 7 }).duration?.value).toBe(
            12,
        );
        expect(
            mediaModelSettings(model, { duration: 126 }).duration?.value,
        ).toBe(12);
        expect(
            mediaModelSettings(model, { duration: 24 }).duration?.value,
        ).toBe(24);
    });

    it("uses the advertised minimum if no valid default is provided", () => {
        expect(
            mediaModelSettings(
                { ...empty, minDuration: 3, maxDuration: 10 },
                { duration: 0 },
            ).duration?.value,
        ).toBe(3);
        expect(
            mediaModelSettings({
                ...empty,
                allowedDurations: [4, 8],
                defaultDuration: 5,
            }).duration?.value,
        ).toBe(4);
    });

    it("drops settings that disappear when the catalog changes", () => {
        expect(
            mediaModelSettings(empty, { resolution: "1080p", duration: 8 }),
        ).toEqual({ resolution: undefined, duration: undefined });
    });
});
