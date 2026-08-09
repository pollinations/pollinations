import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

const messages = [{ role: "user" as const, content: "Hello" }];

describe("resolveModelConfig", () => {
    it("sets Anthropic max_tokens defaults", () => {
        expect(
            resolveModelConfig(messages, { model: "claude" }).options
                .max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, { model: "claude-fast" }).options
                .max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, { model: "claude-large" }).options
                .max_tokens,
        ).toBe(128000);
        expect(
            resolveModelConfig(messages, { model: "claude-fable-5" }).options
                .max_tokens,
        ).toBe(128000);
    });

    it("lets callers override Anthropic max_tokens", () => {
        const result = resolveModelConfig(messages, {
            model: "claude",
            max_tokens: 1024,
        });

        expect(result.options.max_tokens).toBe(1024);
    });

    it("routes claude-large to the global Opus 5 profile", () => {
        const result = resolveModelConfig(messages, {
            model: "claude-large",
        });

        expect(result.options.model).toBe("global.anthropic.claude-opus-5");
    });

    it("does not set max_tokens for non-Anthropic models", () => {
        const result = resolveModelConfig(messages, { model: "openai" });

        expect(result.options.max_tokens).toBeUndefined();
    });

    it("resolves nova-fast to us.amazon.nova-micro-v1:0", () => {
        const result = resolveModelConfig(messages, { model: "nova-fast" });

        expect(result.options.model).toBe("us.amazon.nova-micro-v1:0");
    });

    it("pins longcat to the exact OpenRouter endpoint without fallback", () => {
        const result = resolveModelConfig(messages, { model: "longcat" });

        expect(result.options.model).toBe("meituan/longcat-2.0");
        expect(result.options.provider).toEqual({
            only: ["atlas-cloud/fp8"],
            allow_fallbacks: false,
        });
    });

    it("pins Inkling to Together on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, { model: "inkling" });

        expect(result.options.model).toBe("thinkingmachines/inkling-small");
        expect(result.options.provider).toEqual({
            only: ["Together"],
            allow_fallbacks: false,
        });
    });

    it("pins Mercury to Inception on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, { model: "mercury" });

        expect(result.options.model).toBe("inception/mercury-2");
        expect(result.options.provider).toEqual({
            only: ["Inception"],
            allow_fallbacks: false,
        });
    });

    it("routes Nemotron directly to DeepInfra without fallback", () => {
        const result = resolveModelConfig(messages, { model: "nemotron" });

        expect(result.options.model).toBe(
            "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Step Flash directly to DeepInfra without fallback", () => {
        const result = resolveModelConfig(messages, { model: "step-flash" });

        expect(result.options.model).toBe("stepfun-ai/Step-3.7-Flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("pins Qwen3.7 Flash to Alibaba on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen3.7-flash",
        });

        expect(result.options.model).toBe("qwen/qwen3.7-flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://openrouter.ai/api/v1",
        });
        expect(result.options.provider).toEqual({
            only: ["Alibaba"],
            allow_fallbacks: false,
        });
    });

    it("routes Qwen3.8 Max to Alibaba without fallback", () => {
        const result = resolveModelConfig(messages, { model: "qwen3.8-max" });

        expect(result.options.model).toBe("qwen/qwen3.8-max");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://openrouter.ai/api/v1",
        });
        expect(result.options.provider).toEqual({
            only: ["Alibaba"],
            allow_fallbacks: false,
        });
    });

    it("pins GLM 5.2 to Novita on OpenRouter with a price ceiling", () => {
        const result = resolveModelConfig(messages, { model: "glm" });

        expect(result.options.model).toBe("z-ai/glm-5.2");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openrouter",
        });
        expect(result.options.modelConfig).not.toHaveProperty("custom-host");
        expect(result.options.provider).toEqual({
            only: ["novita/fp8"],
            allow_fallbacks: false,
            max_price: {
                prompt: 0.0812,
                completion: 0.2552,
            },
        });
    });

    it("routes Kimi K3 directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, { model: "kimi-k3" });

        expect(result.options.model).toBe("accounts/fireworks/models/kimi-k3");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes DeepSeek to the exact Fireworks 0731 checkpoint", () => {
        const result = resolveModelConfig(messages, { model: "deepseek" });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/deepseek-v4-flash-0731",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Command A+ to the exact Azure deployment without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "command-a-plus",
        });

        expect(result.options.model).toBe("Cohere-command-a-plus-05-2026");
        expect(result.options.modelConfig).toMatchObject({
            provider: "azure-openai",
            "azure-resource-name": "myceli-prod-eastus",
            "azure-deployment-id": "Cohere-command-a-plus-05-2026",
            "azure-model-name": "Cohere-command-a-plus-05-2026",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it.each([
        "perplexity-high",
        "perplexity-deep",
        "sonar-deep",
    ])("resolves %s to Sonar and forwards an explicit context", async (modelName) => {
        const model = findModelByName(modelName);

        expect(model?.name).toBe("perplexity-fast");
        const result = resolveModelConfig(messages, {
            model: modelName,
            web_search_options: { search_context_size: "high" },
        });
        expect(result.options.model).toBe("sonar");
        expect(result.options.web_search_options).toEqual({
            search_context_size: "high",
        });
    });

    it.each([
        ["grok", undefined, "grok-4-20-non-reasoning"],
        ["grok-4-20-reasoning", undefined, "grok-4-20-non-reasoning"],
        ["grok", "high", "grok-4-20-reasoning"],
        ["grok-4-20-reasoning", "none", "grok-4-20-non-reasoning"],
    ] as const)("routes %s with reasoning_effort=%s to %s", async (model, reasoningEffort, deployment) => {
        const definition = findModelByName(model);
        const transformed = await definition?.transform?.(messages, {
            model,
            reasoning_effort: reasoningEffort,
        });
        if (!transformed) throw new Error("Grok transform missing");

        const result = resolveModelConfig(messages, transformed.options);
        expect(result.options.model).toBe(deployment);
        if (deployment === "grok-4-20-non-reasoning") {
            expect(result.options.reasoning_effort).toBeUndefined();
        }
    });

    it("marks missing model configs as 404 errors", () => {
        expect(() =>
            resolveModelConfig(messages, { model: "not-a-real-model" }),
        ).toThrow(
            expect.objectContaining({
                name: "ModelResolutionError",
                status: 404,
            }),
        );
    });
});
