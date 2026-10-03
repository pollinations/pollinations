import { describe, expect, test } from "vitest";
import type { Model } from "../../../hooks/useModelList";
import { getModelImageUrls } from "./model-selection";

describe("model reference images", () => {
    test.each([
        "image",
        "text",
    ] as const)("keeps attachments for switching back to an image-capable %s model", (type) => {
        const capable: Model = {
            id: "fixture-capable",
            name: "fixture-capable",
            title: "Fixture",
            type,
            hasImageInput: true,
            hasAudioOutput: false,
            hasVideoOutput: false,
        };
        const attachments = [
            "https://fixture.invalid/first.png",
            "https://fixture.invalid/second.png",
        ];
        expect(getModelImageUrls(capable, attachments)).toBe(attachments);
        expect(
            getModelImageUrls(
                { ...capable, hasImageInput: false },
                attachments,
            ),
        ).toEqual([]);
        expect(getModelImageUrls(undefined, attachments)).toEqual([]);
        expect(getModelImageUrls(capable, attachments)).toEqual([
            "https://fixture.invalid/first.png",
            "https://fixture.invalid/second.png",
        ]);
    });
});
