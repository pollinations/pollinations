import { usageToOpenAIImageUsage } from "@shared/registry/usage-headers.ts";
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

describe("usageToOpenAIImageUsage", () => {
    it("maps internal image billing buckets to the OpenAI response shape", () => {
        expect(
            usageToOpenAIImageUsage({
                promptTextTokens: 12,
                promptImageTokens: 40,
                completionImageTokens: 1056,
            }),
        ).toEqual({
            input_tokens: 52,
            output_tokens: 1056,
            total_tokens: 1108,
            input_tokens_details: {
                text_tokens: 12,
                image_tokens: 40,
            },
        });
    });
});
