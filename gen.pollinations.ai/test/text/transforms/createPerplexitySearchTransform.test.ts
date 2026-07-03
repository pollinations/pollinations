import { describe, expect, it } from "vitest";
import { createPerplexitySearchTransform } from "../../../src/text/transforms/createPerplexitySearchTransform.js";

describe("createPerplexitySearchTransform", () => {
    it("injects the model default search context size when absent", async () => {
        const transform = createPerplexitySearchTransform("low");
        const result = await transform([], { model: "perplexity-fast" });

        expect(result.options.web_search_options).toMatchObject({
            search_context_size: "low",
        });
    });

    it("preserves caller-provided search context size", async () => {
        const transform = createPerplexitySearchTransform("low");
        const result = await transform([], {
            model: "perplexity-fast",
            web_search_options: {
                search_context_size: "high",
            },
        });

        expect(result.options.web_search_options).toMatchObject({
            search_context_size: "high",
        });
    });
});
