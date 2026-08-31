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

    it("routes Nemotron 3.5 Lightning directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "nemotron-3.5-lightning",
        });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
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
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
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
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        });
        expect(result.options.provider).toEqual({
            only: ["Alibaba"],
            allow_fallbacks: false,
        });
    });

    it("routes Qwen3.8 2.4T A95B directly to Fireworks", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen3.8-2.4t-a95b",
        });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/qwen3p8-2p4t-a95b",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("pins Qwen3.8 27B to Chutes on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen3.8-27b",
        });

        expect(result.options.model).toBe("qwen/qwen3.8-27b");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        });
        expect(result.options.provider).toEqual({
            only: ["Chutes"],
            allow_fallbacks: false,
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

    it("routes Muse Glimmer directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, { model: "muse-glimmer" });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/muse-glimmer-30b",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Muse Spark 1.2 directly through Vercel without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "muse-spark-1.2",
        });

        expect(result.options.model).toBe("meta/muse-spark-1.2");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://ai-gateway.vercel.sh/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Grok 4.6 directly to its Azure deployment", () => {
        const result = resolveModelConfig(messages, { model: "grok-4.6" });

        expect(result.options.model).toBe("grok-4.6");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/deployments/grok-4.6/chat/completions?api-version=2024-12-01-preview",
            directAuthHeader: "api-key",
            model: "grok-4.6",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes GLM-5.3 directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, { model: "glm-5.3" });

        expect(result.options.model).toBe("accounts/fireworks/models/glm-5p3");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
        expect(result.options.max_tokens).toBe(64000);
    });

    it("routes GLM-5.3 Flash directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "z-ai/glm-5.3-flash",
        });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/glm-5p3-flash",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
        expect(result.options.max_tokens).toBe(64000);
    });

    it.each([
        ["qwen-coder-large", "qwen/qwen3-coder-next", "parasail/bf16"],
        ["qwen-vision", "qwen/qwen3-vl-30b-a3b-instruct", "alibaba"],
        [
            "mistral-small-3.2",
            "mistralai/mistral-small-3.2-24b-instruct",
            "deepinfra/fp8",
        ],
        ["gemma", "google/gemma-4-26b-a4b-it", "novita/bf16"],
        ["gemma-4-31b", "google/gemma-4-31b-it", "novita/bf16"],
        ["mimo-v2.5", "xiaomi/mimo-v2.5", "xiaomi/fp8"],
        ["mimo-v2.5-pro", "xiaomi/mimo-v2.5-pro", "xiaomi/fp8"],
        ["llama-scout", "meta-llama/llama-4-scout", "deepinfra/fp8"],
    ])("pins %s to %s through %s without fallback", (model, route, provider) => {
        const result = resolveModelConfig(messages, { model });

        expect(result.options.model).toBe(route);
        expect(result.options.provider).toEqual({
            only: [provider],
            allow_fallbacks: false,
        });
    });

    it("routes Qwen Vision Pro directly to Alibaba without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen-vision-pro",
        });

        expect(result.options.model).toBe("qwen3-vl-235b-a22b-thinking");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("excludes Mistral's non-standard endpoint variants", () => {
        const result = resolveModelConfig(messages, { model: "mistral" });

        expect(result.options.model).toBe("mistralai/mistral-small-2603");
        expect(result.options.provider).toEqual({
            only: ["mistral"],
            ignore: ["mistral/zdr", "mistral/us", "mistral/eu"],
            allow_fallbacks: false,
        });
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

    it("routes DeepSeek Pro to the exact Fireworks 0813 checkpoint", () => {
        const result = resolveModelConfig(messages, { model: "deepseek-pro" });

        expect(result.options.model).toBe(
            "accounts/fireworks/models/deepseek-v4-pro-0813",
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
