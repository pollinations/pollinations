import { describe, expect, it } from "vitest";
import { buildTrackingHeaders } from "../../src/image/utils/trackingHeaders.ts";

describe("buildTrackingHeaders", () => {
    it("uses explicit provider usage", () => {
        expect(
            buildTrackingHeaders("flux", {
                actualModel: "flux",
                usage: { completionImageTokens: 1 },
            }),
        ).toMatchObject({
            "x-model-used": "flux",
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
