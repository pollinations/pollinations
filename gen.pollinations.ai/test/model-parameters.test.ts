import { describe, expect, it } from "vitest";
import {
    ModelInfoSchema,
    getTextModelsInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";

// Official chat models with different capability profiles, each declaring
// supportedParameters/defaultParameters in the registry.
const CHAT_MODEL_CASES = [
    {
        model: "openai/gpt-5.4-nano",
        tools: true,
        reasoning: false,
        search: false,
    },
    {
        model: "openai/gpt-6-astra",
        tools: true,
        reasoning: true,
        search: false,
    },
    {
        model: "deepseek/deepseek-v4-flash-vision-exp",
        tools: true,
        reasoning: true,
        search: false,
    },
    {
        model: "perplexity/sonar",
        tools: false,
        reasoning: false,
        search: true,
    },
] as const;

describe("model listing parameters metadata", () => {
    it("exposes supported_parameters that match each model's capabilities", () => {
        for (const { model, tools, reasoning, search } of CHAT_MODEL_CASES) {
            const definition = getRegistryModelDefinition(model);
            const info = modelInfoFromDefinition(model, definition);
            expect(info.supported_parameters).toBeDefined();
            expect(info.supported_parameters).toContain("temperature");
            // Conditional parameters follow the model's capability flags.
            expect(info.supported_parameters?.includes("tools")).toBe(tools);
            expect(info.supported_parameters?.includes("tool_choice")).toBe(
                tools,
            );
            expect(info.supported_parameters?.includes("reasoning_effort")).toBe(
                reasoning,
            );
            expect(info.supported_parameters?.includes("web_search_options")).toBe(
                search,
            );
            // Structural request fields are never listed.
            expect(info.supported_parameters).not.toContain("messages");
            expect(info.supported_parameters).not.toContain("stream");
        }
    });

    it("lists only gateway-applied defaults in default_parameters", () => {
        const sonar = modelInfoFromDefinition(
            "perplexity/sonar",
            getRegistryModelDefinition("perplexity/sonar"),
        );
        expect(sonar.default_parameters).toEqual({
            web_search_options: { search_context_size: "low" },
        });
        for (const { model } of CHAT_MODEL_CASES) {
            if (model === "perplexity/sonar") continue;
            const info = modelInfoFromDefinition(
                model,
                getRegistryModelDefinition(model),
            );
            // No gateway defaults: unset parameters use upstream defaults.
            expect(info.default_parameters).toEqual({});
        }
    });

    it("serves the metadata through the text model listing", () => {
        const listed = getTextModelsInfo();
        const astra = listed.find((m) => m.name === "openai/gpt-6-astra");
        expect(astra?.supported_parameters).toContain("reasoning_effort");
        // The enriched info must satisfy the published listing schema.
        const parsed = ModelInfoSchema.parse(astra);
        expect(parsed.supported_parameters).toContain("tools");
    });
});
