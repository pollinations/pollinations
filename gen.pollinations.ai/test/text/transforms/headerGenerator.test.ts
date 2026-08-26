import { describe, expect, it } from "vitest";
import { generateHeaders } from "../../../src/text/transforms/headerGenerator.js";

describe("generateHeaders", () => {
    it("sends bearer auth and no Portkey headers for a direct endpoint", async () => {
        const { options } = await generateHeaders([], {
            modelConfig: {
                provider: "openrouter",
                directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
                authKey: "test-openrouter-key",
            },
        });

        expect(options.additionalHeaders).toEqual({
            Authorization: "Bearer test-openrouter-key",
        });
    });

    it("translates a Portkey config into x-portkey-* headers", async () => {
        const { options } = await generateHeaders([], {
            modelConfig: { provider: "perplexity-ai", authKey: "test-key" },
        });

        expect(options.additionalHeaders).toEqual({
            "x-portkey-strict-open-ai-compliance": "false",
            "x-portkey-provider": "perplexity-ai",
            Authorization: "Bearer test-key",
        });
    });
});
