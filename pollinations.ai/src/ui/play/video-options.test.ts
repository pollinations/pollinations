import { describe, expect, it } from "vitest";
import { videoOptions } from "./video-options";

describe("video controls", () => {
    it("retains the gateway-supported square aspect ratio for Kling text-to-video links", () => {
        expect(videoOptions("kwaivgi/kling-v3.0-std", []).ratios).toContain(
            "1:1",
        );
    });
    it("matches optional sound defaults and fixed sound capabilities", () => {
        expect(
            videoOptions("google/veo-3.1-fast", ["audio_output"]),
        ).toMatchObject({ sound: "optional", defaultSound: false });
        expect(
            videoOptions("bytedance/seedance-2.0", ["audio_output"]),
        ).toMatchObject({ sound: "optional", defaultSound: true });
        // Kling adds audio only for audio=true and bills it extra: off by default.
        expect(
            videoOptions("kwaivgi/kling-v3.0-std", ["audio_output"]),
        ).toMatchObject({ sound: "optional", defaultSound: false });
        for (const id of [
            "black-forest-labs/flux-3-max",
            "kandinskylab/kandinsky-6.0-lite",
        ])
            expect(videoOptions(id, ["audio_output"])).toMatchObject({
                sound: "optional",
                defaultSound: true,
            });
        expect(
            videoOptions("minimax/minimax-h3", ["audio_output"]),
        ).toMatchObject({ sound: "on", ratios: ["16:9"] });
        expect(videoOptions("x-ai/grok-imagine-video-1.5-lite", []).sound).toBe(
            "off",
        );
    });
    it("offers only the ratios each handler accepts", () => {
        expect(videoOptions("alibaba/wan-2.2-fast", []).ratios).toContain(
            "1:1",
        );
        expect(
            videoOptions("black-forest-labs/flux-3-max", []).ratios,
        ).toContain("21:9");
        expect(
            videoOptions("bytedance/seedance-1-pro-fast", []).ratios,
        ).not.toContain("9:21");
        expect(videoOptions("alibaba/happyhorse-1.1", []).ratios).toContain(
            "9:21",
        );
        // Mirelo adds sound to a source video, so there is no ratio to pick.
        expect(videoOptions("mirelo/sfx-2.0", []).ratios).toEqual([]);
    });
    it("preselects 16:9 only where an unset ratio would render square", () => {
        for (const id of [
            "x-ai/grok-imagine-video-1.5",
            "kwaivgi/kling-v3.0-std",
            "alibaba/wan-3.0",
            "prunaai/p-video",
        ])
            expect(videoOptions(id, []).defaultRatio).toBe("16:9");
        // These already render 16:9 without a ratio, so Auto stays the default.
        for (const id of ["google/veo-3.1-fast", "bytedance/seedance-2.5"])
            expect(videoOptions(id, [])).toMatchObject({
                defaultRatio: "",
                ratios: expect.arrayContaining([""]),
            });
        expect(videoOptions("minimax/minimax-h3", []).defaultRatio).toBe(
            "16:9",
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
});
