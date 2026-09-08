import { describe, expect, it } from "vitest";
import { processParameters } from "../../../src/text/transforms/parameterProcessor.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

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

    it("strips stream_options for non-OpenAI Azure models when streaming", () => {
        const result = processParameters(messages, {
            model: "grok-4.3",
            stream: true,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "grok-4.3",
            },
            modelDef,
        });

        expect(result.options.stream_options).toBeUndefined();
    });

    it("strips nullable stream_options for non-OpenAI Azure models", () => {
        const result = processParameters(messages, {
            model: "mistralai/mistral-large-3",
            stream_options: null as unknown as Record<string, unknown>,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "Mistral-Large-3",
            },
            modelDef,
        });

        expect(result.options.stream_options).toBeUndefined();
    });

    it("keeps stream_options for OpenAI Azure models when streaming", () => {
        const result = processParameters(messages, {
            model: "gpt-5-nano",
            stream: true,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "gpt-5-nano",
            },
            modelDef,
        });

        expect(result.options.stream_options).toEqual({ include_usage: true });
    });

    it.each([
        "gpt-5.5",
        "gpt-5.6-sol",
        "gpt-6-astra",
        "gpt-6-astra-datazone",
        "openai/gpt-6-astra",
        "o3",
    ])("normalizes unsupported sampling parameters for %s", (model) => {
        const result = processParameters(messages, {
            model,
            temperature: 0.7,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
            top_k: 40,
            seed: 42,
            repetition_penalty: 1.1,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": model,
            },
            modelDef,
        });

        expect(result.options.temperature).toBeUndefined();
        expect(result.options.top_p).toBeUndefined();
        expect(result.options.frequency_penalty).toBeUndefined();
        expect(result.options.presence_penalty).toBeUndefined();
        expect(result.options.top_k).toBeUndefined();
        expect(result.options.seed).toBeUndefined();
        expect(result.options.repetition_penalty).toBeUndefined();
    });

    it.each([
        undefined,
        "none",
        "high",
    ])("uses the same sampling policy with reasoning_effort=%s", (reasoning_effort) => {
        const options = {
            model: "openai/gpt-5.4",
            temperature: 0.7,
            top_p: 0.9,
            reasoning_effort,
            max_tokens: 128,
            stop: ["END"],
            logprobs: true,
        };
        const resolved = resolveModelConfig(messages, options);
        const result = processParameters(resolved.messages, resolved.options);
        expect(result.options.temperature).toBeUndefined();
        expect(result.options.top_p).toBeUndefined();
        expect(result.options).toMatchObject({
            max_completion_tokens: 128,
            stop: ["END"],
            logprobs: true,
        });
        expect(result.options.reasoning_effort).toBe(reasoning_effort);
        expect(options.temperature).toBe(0.7);
        expect(result.messages).toBe(messages);
    });

    it.each([
        "openai/gpt-6-astra",
        "openai/gpt-5.6-luna",
        "gpt-5.6-luna",
    ])("strips sampling after resolving catalog model %s", (model) => {
        const resolved = resolveModelConfig(messages, {
            model,
            temperature: 0.7,
        });
        expect(
            processParameters(resolved.messages, resolved.options).options,
        ).not.toHaveProperty("temperature");
    });

    it("omits stream_options when not streaming", () => {
        const result = processParameters(messages, {
            model: "gpt-oss-20b",
            stream: false,
            stream_options: { include_usage: true },
            modelConfig: { provider: "fireworks-ai" },
            modelDef,
        });
        expect(result.options).not.toHaveProperty("stream_options");
    });

    it.each([
        "gpt-4.1",
        "gpt-oss-20b",
        "google/gemini-2.5-flash-lite",
        "deepseek-v4-flash",
        "qwen/qwen3.7-plus",
        "mistralai/mistral-large-2512",
    ])("keeps sampling parameters for %s", (model) => {
        const result = processParameters(messages, {
            model,
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            seed: 42,
            repetition_penalty: 1.1,
            frequency_penalty: 0.5,
            presence_penalty: 0.5,
            modelConfig: { provider: "openai" },
            modelDef,
        });

        expect(result.options.temperature).toBe(0.7);
        expect(result.options.top_p).toBe(0.9);
        expect(result.options.top_k).toBe(40);
        expect(result.options.seed).toBe(42);
        expect(result.options.repetition_penalty).toBe(1.1);
        expect(result.options.frequency_penalty).toBe(0.5);
        expect(result.options.presence_penalty).toBe(0.5);
    });

    it.each([
        "us.anthropic.claude-opus-4-7",
        "global.anthropic.claude-opus-4-8",
        "global.anthropic.claude-opus-5",
        "global.anthropic.claude-fable-5",
        "global.anthropic.claude-fable-5-1",
        "global.anthropic.claude-sonnet-5",
        "anthropic/claude-opus-4.7",
    ])("strips temperature/top_p/top_k for %s", (model) => {
        const result = processParameters(messages, {
            model,
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            modelConfig: { provider: "bedrock" },
            modelDef,
        });

        expect(result.options.temperature).toBeUndefined();
        expect(result.options.top_p).toBeUndefined();
        expect(result.options.top_k).toBeUndefined();
    });

    it("drops top_p when temperature is also set for Bedrock Claude models", () => {
        const both = processParameters(messages, {
            model: "global.anthropic.claude-sonnet-4-6",
            temperature: 0.7,
            top_p: 0.9,
            modelConfig: { provider: "bedrock" },
            modelDef,
        });

        expect(both.options.top_p).toBeUndefined();
        expect(both.options.temperature).toBe(0.7);

        const topPOnly = processParameters(messages, {
            model: "global.anthropic.claude-sonnet-4-6",
            top_p: 0.9,
            modelConfig: { provider: "bedrock" },
            modelDef,
        });

        expect(topPOnly.options.top_p).toBe(0.9);
    });

    it("does not strip temperature for Claude Opus 4.6", () => {
        const result = processParameters(messages, {
            model: "us.anthropic.claude-opus-4-6-v1",
            temperature: 0.7,
            modelConfig: { provider: "bedrock" },
            modelDef,
        });

        expect(result.options.temperature).toBe(0.7);
    });
});
