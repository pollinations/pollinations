import { describe, expect, it } from "vitest";
import { buildTrackingHeaders } from "../../src/image/utils/trackingHeaders.ts";

describe("buildTrackingHeaders", () => {
    it("uses explicit provider usage", () => {
        expect(
            buildTrackingHeaders("black-forest-labs/flux.1-schnell", {
                actualModel: "black-forest-labs/flux.1-schnell",
                usage: { completionImageTokens: 1 },
            }),
        ).toMatchObject({
            "x-model-used": "black-forest-labs/flux.1-schnell",
            "x-usage-completion-image-tokens": "1",
        });
    });

    it("rejects missing usage instead of inventing an image unit", () => {
        expect(() =>
            buildTrackingHeaders(
                "black-forest-labs/flux.1-schnell",
                undefined as never,
            ),
        ).toThrow(
            "Missing billable usage for black-forest-labs/flux.1-schnell",
        );
        expect(() =>
            buildTrackingHeaders("black-forest-labs/flux.1-schnell", {
                usage: undefined,
            } as never),
        ).toThrow(
            "Missing billable usage for black-forest-labs/flux.1-schnell",
        );
        expect(() =>
            buildTrackingHeaders("black-forest-labs/flux.1-schnell", {
                usage: {},
            }),
        ).toThrow(
            "Missing billable usage for black-forest-labs/flux.1-schnell",
        );
    });
});
