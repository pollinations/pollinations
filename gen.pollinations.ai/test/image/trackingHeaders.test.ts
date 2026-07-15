import { describe, expect, it } from "vitest";
import { buildTrackingHeaders } from "../../src/image/utils/trackingHeaders.ts";

describe("buildTrackingHeaders", () => {
    it("uses explicit provider usage", () => {
        expect(
            buildTrackingHeaders("flux-schnell", {
                actualModel: "flux-schnell",
                usage: { completionImageTokens: 1 },
            }),
        ).toMatchObject({
            "x-model-used": "flux-schnell",
            "x-usage-completion-image-tokens": "1",
        });
    });

    it("rejects missing usage instead of inventing an image unit", () => {
        expect(() =>
            buildTrackingHeaders("flux-schnell", undefined as never),
        ).toThrow("Missing billable usage for flux-schnell");
        expect(() =>
            buildTrackingHeaders("flux-schnell", {
                usage: undefined,
            } as never),
        ).toThrow("Missing billable usage for flux-schnell");
        expect(() =>
            buildTrackingHeaders("flux-schnell", { usage: {} }),
        ).toThrow("Missing billable usage for flux-schnell");
    });
});
