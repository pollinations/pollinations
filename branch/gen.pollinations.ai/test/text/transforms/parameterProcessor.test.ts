import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { portkeyConfig } from "../../../src/text/configs/modelConfigs.js";
import { processParameters } from "../../../src/text/transforms/parameterProcessor.js";
import {
    omitParameters,
    preferTemperature,
} from "../../../src/text/transforms/parameterTransforms.js";
import { pipe } from "../../../src/text/transforms/pipe.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

const messages = [{ role: "user" as const, content: "hello" }];
const modelDef = { name: "test-model" };

describe("processParameters", () => {
    it("converts max_tokens to max_completion_tokens for Azure OpenAI models", () => {
        const result = processParameters(messages, {
            model: "gpt-5-nano",
            max_tokens: 128,
            modelConfig: portkeyConfig["gpt-5-nano-2025-08-07"](),
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
                supportsStreamOptions: false,
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
            modelConfig: portkeyConfig["grok-4.3"](),
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
                supportsStreamOptions: false,
            },
            modelDef,
        });

        expect(result.options.stream_options).toBeUndefined();
    });

    it("keeps stream_options for OpenAI Azure models when streaming", () => {
        const result = processParameters(messages, {
            model: "gpt-5-nano",
            stream: true,
            modelConfig: portkeyConfig["gpt-5-nano-2025-08-07"](),
            modelDef,
        });

        expect(result.options.stream_options).toEqual({ include_usage: true });
    });

    it("omits stream_options when not streaming", () => {
        const result = processParameters(messages, {
            model: "gpt-oss-20b",
            stream: false,
            stream_options: { include_usage: true },
            modelConfig: { provider: "openai" },
            modelDef,
        });
        expect(result.options).not.toHaveProperty("stream_options");
    });

    it("uses declared transport settings regardless of provider or deployment name", () => {
        const result = processParameters(messages, {
            model: "custom-deployment",
            stream: true,
            max_tokens: 128,
            modelConfig: {
                provider: "custom-provider",
                supportsMaxCompletionTokens: true,
                supportsStreamOptions: false,
            },
            modelDef,
        });
        expect(result.options.max_completion_tokens).toBe(128);
        expect(result.options).not.toHaveProperty("max_tokens");
        expect(result.options).not.toHaveProperty("stream_options");
    });

    it("does not infer transport settings from an Azure deployment name", () => {
        const result = processParameters(messages, {
            model: "gpt-custom",
            max_completion_tokens: 128,
            modelConfig: {
                provider: "azure-openai",
                "azure-deployment-id": "gpt-custom",
            },
            modelDef,
        });
        expect(result.options.max_tokens).toBe(128);
        expect(result.options).not.toHaveProperty("max_completion_tokens");
    });

    it.each([
        true,
        false,
    ])("applies transport settings after config defaults (stream=%s)", (stream) => {
        const options = {
            model: "openai/gpt-5-nano",
            stream,
            modelConfig: {
                ...portkeyConfig["gpt-5-nano-2025-08-07"](),
                defaultOptions: { max_tokens: 128 },
            },
        };
        const resolved = resolveModelConfig(messages, options);
        const result = processParameters(resolved.messages, resolved.options);
        expect(result.options.max_completion_tokens).toBe(128);
        expect(result.options).not.toHaveProperty("max_tokens");
        expect(result.options.stream_options).toEqual(
            stream ? { include_usage: true } : undefined,
        );
    });

    it("composes immutable parameter transforms without inspecting model names", async () => {
        const options = Object.freeze({
            model: "arbitrary-model",
            temperature: 0.7,
            top_p: 0.9,
            seed: 42,
            reasoning_effort: "high",
            max_tokens: 128,
            stop: ["END"],
        });
        const transform = pipe(omitParameters("seed"), preferTemperature);
        const result = await transform(messages, options);
        expect(result.options).toEqual({
            model: "arbitrary-model",
            temperature: 0.7,
            reasoning_effort: "high",
            max_tokens: 128,
            stop: ["END"],
        });
        expect(result.messages).toBe(messages);
        expect(options.seed).toBe(42);
        expect(options.top_p).toBe(0.9);
    });

    it.each([
        "openai/gpt-5.4-nano",
        "openai/gpt-5-nano",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "openai/gpt-5.5",
        "openai/gpt-5.6-sol",
        "openai/gpt-5.6-terra",
        "openai/gpt-5.6-luna",
        "openai/gpt-6-astra",
        "openai/gpt-6-astra:azure:datazone",
        "pollinations/midijourney",
        "pollinations/midijourney-large",
    ])("removes sampling without changing reasoning or reintroducing defaults for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error("expected catalog transform");
        for (const reasoning_effort of [
            undefined,
            "none",
            "minimal",
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
        ]) {
            for (const stream of [false, true]) {
                const options = {
                    model,
                    reasoning_effort,
                    stream,
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    seed: 42,
                    frequency_penalty: 0.5,
                    presence_penalty: 0.5,
                    repetition_penalty: 1.1,
                    max_tokens: 128,
                    stop: ["END"],
                    logprobs: true,
                };
                const transformed = await transform(messages, options);
                const resolved = resolveModelConfig(
                    transformed.messages,
                    transformed.options,
                );
                const result = processParameters(
                    resolved.messages,
                    resolved.options,
                );
                for (const key of [
                    "temperature",
                    "top_p",
                    "top_k",
                    "seed",
                    "frequency_penalty",
                    "presence_penalty",
                    "repetition_penalty",
                ]) {
                    expect(result.options).not.toHaveProperty(key);
                }
                expect(result.options.reasoning_effort).toBe(reasoning_effort);
                expect(result.options).toMatchObject({
                    stream,
                    max_completion_tokens: 128,
                    stop: ["END"],
                    logprobs: true,
                });
                expect(result.options.stream_options).toEqual(
                    stream ? { include_usage: true } : undefined,
                );
                expect(options.temperature).toBe(0.7);
            }
        }
    });

    it.each([
        "anthropic/claude-sonnet-5",
        "anthropic/claude-opus-4.7",
        "anthropic/claude-opus-4.7:openrouter:vertex-global",
        "anthropic/claude-opus-5",
        "anthropic/claude-fable-5",
        "anthropic/claude-fable-5:openrouter:vertex-global",
        "anthropic/claude-fable-5.1",
    ])("removes sampling while keeping the model's existing thinking behavior for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error("expected catalog transform");
        for (const reasoning_effort of [
            undefined,
            "none",
            "minimal",
            "low",
            "medium",
            "high",
            "xhigh",
            "max",
        ]) {
            const options = { model, reasoning_effort, max_tokens: 16000 };
            const baseline = await transform(messages, options);
            const withSampling = await transform(messages, {
                ...options,
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
            });
            expect(withSampling).toEqual(baseline);
            const resolved = resolveModelConfig(
                withSampling.messages,
                withSampling.options,
            );
            const result = processParameters(
                resolved.messages,
                resolved.options,
            );
            expect(result.options).not.toHaveProperty("temperature");
            expect(result.options).not.toHaveProperty("top_p");
            expect(result.options).not.toHaveProperty("top_k");
        }
    });

    it.each([
        "anthropic/claude-haiku-4.5",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-opus-4.6",
    ])("keeps the existing temperature preference for %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error("expected catalog transform");
        const both = await transform(messages, {
            temperature: 0.7,
            top_p: 0.9,
        });
        expect(both.options.temperature).toBe(0.7);
        expect(both.options).not.toHaveProperty("top_p");
        const topPOnly = await transform(messages, { top_p: 0.9 });
        expect(topPOnly.options.top_p).toBe(0.9);
    });

    it.each([
        "openai/gpt-5.6-luna",
        "gpt-5.6-luna",
    ])("uses the same declared transform for canonical names and aliases: %s", async (model) => {
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error("expected catalog transform");
        expect(
            (await transform(messages, { model, temperature: 0.7 })).options,
        ).not.toHaveProperty("temperature");
    });

    it("does not impose sampling rules on an undeclared upstream model name", () => {
        const options = {
            model: "gpt-5-custom",
            temperature: 0.7,
            top_p: 0.9,
            seed: 42,
            modelConfig: { provider: "openai" },
            modelDef,
        };
        expect(processParameters(messages, options).options).toEqual(options);
    });
});
