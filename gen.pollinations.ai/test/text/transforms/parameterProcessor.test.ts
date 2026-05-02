import { describe, expect, it } from "vitest";
import { processParameters } from "../../../src/text/transforms/parameterProcessor.js";

const messages = [{ role: "user" as const, content: "hello" }];
const modelDef = { name: "test-model" };

describe("processParameters", () => {
    it("converts max_tokens to max_completion_tokens for Azure OpenAI models", () => {
        const result = processParameters(messages, {
            model: "gpt-5-nano",
            max_tokens: 128,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "gpt-5-nano",
            },
            modelDef,
        });

        expect(result.options.max_tokens).toBeUndefined();
        expect(result.options.max_completion_tokens).toBe(128);
    });

    it("normalizes max_completion_tokens back to max_tokens for non-OpenAI Azure models", () => {
        const result = processParameters(messages, {
            model: "Mistral-Small-3.2-24B-Instruct-2506",
            max_completion_tokens: 128,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "Mistral-Small-3.2-24B-Instruct-2506",
            },
            modelDef,
        });

        expect(result.options.max_tokens).toBe(128);
        expect(result.options.max_completion_tokens).toBeUndefined();
    });
});
