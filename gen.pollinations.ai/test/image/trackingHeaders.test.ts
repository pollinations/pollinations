import { describe, expect, it } from "vitest";
import { buildTrackingHeaders } from "../../src/image/utils/trackingHeaders.ts";

describe("buildTrackingHeaders", () => {
    it("emits usage and served-provider metadata", () => {
        expect(
            buildTrackingHeaders("flux", {
                actualModel: "flux-1-schnell-fp8",
                actualProvider: "fireworks",
                fallbackTarget: "config.targets[1]",
                usage: { completionImageTokens: 1 },
            }),
        ).toMatchObject({
            "x-model-used": "flux-1-schnell-fp8",
            "x-model-provider-used": "fireworks",
            "x-fallback-target": "config.targets[1]",
            "x-usage-completion-image-tokens": "1",
        });
    });

    it("rejects missing usage instead of inventing an image unit", () => {
        expect(() => buildTrackingHeaders("flux", undefined as never)).toThrow(
            "Missing billable usage for flux",
        );
        expect(() =>
            buildTrackingHeaders("flux", { usage: undefined } as never),
        ).toThrow("Missing billable usage for flux");
        expect(() => buildTrackingHeaders("flux", { usage: {} })).toThrow(
            "Missing billable usage for flux",
        );
    });
});
