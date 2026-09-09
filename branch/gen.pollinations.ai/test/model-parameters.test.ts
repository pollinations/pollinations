import { describe, expect, test } from "vitest";
import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import { textModels } from "../../shared/registry/text.ts";

describe("model supportedParameters and defaultParameters", () => {
    test("gpt-5.4-nano exposes supported and default parameters", () => {
        const info = modelInfoFromDefinition(textModels["openai/gpt-5.4-nano"]);
        expect(info.supported_parameters).toContain("temperature");
        expect(info.supported_parameters).toContain("tools");
        expect(info.default_parameters).toHaveProperty("temperature");
        expect(info.default_parameters?.temperature).toBe(0.7);
    });

    test("gpt-5.4 exposes reasoning_effort", () => {
        const info = modelInfoFromDefinition(textModels["openai/gpt-5.4"]);
        expect(info.supported_parameters).toContain("reasoning_effort");
        expect(info.default_parameters).toHaveProperty("max_tokens");
    });

    test("deepseek-v4-flash has limited parameters", () => {
        const info = modelInfoFromDefinition(textModels["deepseek/deepseek-v4-flash"]);
        expect(info.supported_parameters).not.toContain("logprobs");
        expect(info.supported_parameters).toContain("reasoning_effort");
        expect(info.default_parameters?.max_tokens).toBe(8192);
    });
});
