import { describe, expect, it } from "vitest";
import { normalizeGeminiBuiltInTools } from "../../../src/text/transforms/createGeminiToolsTransform.ts";

describe("normalizeGeminiBuiltInTools", () => {
    it("converts only requested Gemini built-in tools for Portkey", async () => {
        const customTool = {
            type: "function",
            function: { name: "get_weather" },
        };
        const { options } = await normalizeGeminiBuiltInTools([], {
            tools: [
                { type: "google_search" },
                { type: "code_execution" },
                customTool,
            ],
        });

        expect(options.tools).toEqual([
            { type: "function", function: { name: "google_search" } },
            { type: "function", function: { name: "code_execution" } },
            customTool,
        ]);
    });

    it("does not add tools when none are requested", async () => {
        const withoutTools = await normalizeGeminiBuiltInTools([], {});
        const withEmptyTools = await normalizeGeminiBuiltInTools([], {
            tools: [],
        });

        expect(withoutTools.options.tools).toBeUndefined();
        expect(withEmptyTools.options.tools).toEqual([]);
    });
});
