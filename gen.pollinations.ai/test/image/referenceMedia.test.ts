import { describe, expect, it } from "vitest";
import { resolveReferenceMedia } from "../../src/image/utils/referenceMedia.ts";

const CAPS = {
    title: "Test model",
    maxImages: 2,
    maxVideos: 1,
    maxAudios: 1,
};

describe("resolveReferenceMedia", () => {
    it("passes reference URLs through untouched", () => {
        const refs = resolveReferenceMedia(
            {
                image: [],
                reference_images: ["https://a.example/1.png"],
                reference_videos: [],
                reference_audios: [],
            },
            CAPS,
        );

        expect(refs).toEqual({
            images: ["https://a.example/1.png"],
            videos: [],
            audios: [],
        });
    });

    it("rejects combining references with frame images", () => {
        expect(() =>
            resolveReferenceMedia(
                {
                    image: ["https://a.example/first.png"],
                    reference_images: [],
                    reference_videos: ["https://a.example/clip.mp4"],
                    reference_audios: [],
                },
                CAPS,
            ),
        ).toThrow(/cannot combine/i);
    });

    it("enforces per-model caps", () => {
        expect(() =>
            resolveReferenceMedia(
                {
                    image: [],
                    reference_images: [
                        "https://a.example/1.png",
                        "https://a.example/2.png",
                        "https://a.example/3.png",
                    ],
                    reference_videos: [],
                    reference_audios: [],
                },
                CAPS,
            ),
        ).toThrow(/at most 2 reference images/);
    });

    it("requires a visual anchor for reference audios", () => {
        expect(() =>
            resolveReferenceMedia(
                {
                    image: [],
                    reference_images: [],
                    reference_videos: [],
                    reference_audios: ["https://a.example/voice.mp3"],
                },
                CAPS,
            ),
        ).toThrow(/require at least one reference image or reference video/);
    });

    it("accepts audios anchored by a reference video", () => {
        const refs = resolveReferenceMedia(
            {
                image: [],
                reference_images: [],
                reference_videos: ["https://a.example/clip.mp4"],
                reference_audios: ["https://a.example/voice.mp3"],
            },
            CAPS,
        );

        expect(refs.audios).toEqual(["https://a.example/voice.mp3"]);
    });
});
