import { describe, expect, it } from "vitest";
import { buildHeygenAvatarRequest } from "../../src/image/models/heygenAvatar6Model.ts";
import { ImageParamsSchema } from "../../src/image/params.ts";

const photo = "https://example.com/photo.png";
const audio = "https://example.com/audio.mp3";
const video = "https://example.com/character.mp4";
describe.each([
    ["heygen/heygen-avatar-6", "heygen/avatar-6"],
    ["heygen/heygen-avatar-6-turbo", "heygen/avatar-6/turbo"],
] as const)("%s", (model, endpoint) => {
    it("maps an image and speech audio to fal and OpenRouter", () => {
        const params = ImageParamsSchema.parse({
            model,
            image: [photo],
            reference_audios: [audio],
            resolution: "2k",
        });
        const request = buildHeygenAvatarRequest("subtle nods", params);
        expect(request.endpoint).toBe(`${endpoint}/image-to-video`);
        expect(request.input).toMatchObject({
            image_url: photo,
            audio_url: audio,
            motion_prompt: "subtle nods",
            resolution: "2k",
        });
        expect(request.openrouter).toMatchObject({
            model,
            resolution: "2K",
            provider: { only: ["heygen"], allow_fallbacks: false },
        });
        expect(request.openrouter.input_references).toHaveLength(2);
    });
    it("maps a reference video and optional photo", () => {
        const params = ImageParamsSchema.parse({
            model: `${model}:openrouter`,
            reference_videos: [video],
            reference_images: [photo],
            reference_audios: [audio],
        });
        const request = buildHeygenAvatarRequest("gesture", params);
        expect(request.endpoint).toBe(`${endpoint}/ref-video-to-video`);
        expect(request.input).toMatchObject({
            video_url: video,
            image_url: photo,
            audio_url: audio,
        });
        expect(request.openrouter.input_references).toHaveLength(3);
    });
    it("rejects missing audio, identity, duplicate photos, and explicit duration", () => {
        for (const bad of [
            { image: [photo] },
            { reference_audios: [audio] },
            { image: [photo, photo], reference_audios: [audio] },
            { image: [photo], reference_audios: [audio], duration: 5 },
        ]) {
            expect(
                ImageParamsSchema.safeParse({
                    model,
                    ...bad,
                }).success,
            ).toBe(false);
        }
    });
});
