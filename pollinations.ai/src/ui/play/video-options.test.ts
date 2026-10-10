import { describe, expect, it } from "vitest";
import { reproducibleApiUrl, videoOptions } from "./video-options";

describe("video controls", () => {
    it("matches optional sound defaults and fixed sound capabilities", () => {
        expect(
            videoOptions("google/veo-3.1-fast", ["audio_output"]),
        ).toMatchObject({ sound: "optional", defaultSound: false });
        expect(
            videoOptions("bytedance/seedance-2.0", ["audio_output"]),
        ).toMatchObject({ sound: "optional", defaultSound: true });
        expect(
            videoOptions("minimax/minimax-h3", ["audio_output"]),
        ).toMatchObject({ sound: "on", ratios: ["16:9"] });
        expect(videoOptions("x-ai/grok-imagine-video-1.5-lite", []).sound).toBe(
            "off",
        );
    });
    it("separates references from frames only where Gen rejects their combination", () => {
        for (const id of [
            "alibaba/wan-2.7",
            "alibaba/wan-3.0",
            "minimax/minimax-h3-max",
        ])
            expect(videoOptions(id, []).exclusiveReferences).toBe(true);
        expect(
            videoOptions("bytedance/seedance-2.0", []).exclusiveReferences,
        ).toBe(false);
        expect(videoOptions("bytedance/seedance-2.5", []).ratios).toContain(
            "21:9",
        );
    });
    it("preserves actual request inputs while replacing the credential for copying", () => {
        const original = new URL(
            "https://gen.pollinations.ai/video/a%20scene?seed=123&audio=false&reference_videos=https%3A%2F%2Fmedia.example%2Fclip.mp4&key=test-placeholder",
        );
        const copied = new URL(reproducibleApiUrl(original.toString()));
        expect(copied.searchParams.get("key")).toBe("YOUR_API_KEY");
        original.searchParams.delete("key");
        copied.searchParams.delete("key");
        expect(copied.toString()).toBe(original.toString());
    });
});
