import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { resolveModelConfig } from "../../../src/text/utils/modelResolver.js";

const messages = [{ role: "user" as const, content: "Hello" }];

describe("resolveModelConfig", () => {
    it("keeps Microsoft Decision-1 backup pins in the native config", () => {
        for (const [suffix, pin] of [
            ["vercel", { providerOptions: { gateway: { only: ["azure"] } } }],
            [
                "openrouter",
                {
                    provider: {
                        only: ["azure"],
                        ignore: ["cloudflare"],
                        allow_fallbacks: false,
                    },
                },
            ],
        ] as const) {
            const result = resolveModelConfig(messages, {
                model: `microsoft/microsoft-decision-1:${suffix}`,
                provider: { only: ["cloudflare"] },
            });
            expect(result.options.modelConfig?.defaultOptions).toMatchObject(
                pin,
            );
        }
    });

    it("pins Liquid D1's primary and backup native configs", () => {
        for (const [model, expected] of [
            [
                "liquid/d1",
                { providerOptions: { gateway: { only: ["liquid"] } } },
            ],
            [
                "liquid/d1:openrouter",
                {
                    provider: {
                        only: ["liquid"],
                        ignore: ["cloudflare"],
                        allow_fallbacks: false,
                    },
                },
            ],
        ] as const) {
            const result = resolveModelConfig(messages, {
                model,
                provider: { only: ["cloudflare"] },
            });
            expect(result.options.modelConfig?.defaultOptions).toEqual(
                expected,
            );
        }
    });

    it("keeps jaredpalmer/kev-4b's native provider pin", () => {
        const result = resolveModelConfig(messages, {
            model: "jaredpalmer/kev-4b",
            provider: { only: ["cloudflare"] },
        });
        expect(result.options.modelConfig?.defaultOptions).toMatchObject({
            provider: {
                "only": ["siliconflow/fp8"],
                "ignore": ["cloudflare"],
                "allow_fallbacks": false,
            },
        });
    });

    it("preserves Glyph reasoning flags when mapping reasoning_effort", async () => {
        const resolved = resolveModelConfig(messages, {
            model: "stealth/glyph-cluster",
            reasoning_effort: "low",
            reasoning: { exclude: true },
        });
        const model = findModelByName("stealth/glyph-cluster");
        const transformed = await model?.transform?.(
            messages,
            resolved.options,
        );
        expect(transformed?.options.reasoning).toEqual({
            exclude: true,
            effort: "low",
        });
        expect(transformed?.options.reasoning_effort).toBeUndefined();
        expect(resolved.options.providerOptions).toEqual({
            gateway: { only: ["stealth"] },
        });
    });
    it("keeps respan/span-01-lite's native provider pin", () => {
        const result = resolveModelConfig(messages, {
            model: "respan/span-01-lite",
            provider: { only: ["cloudflare"] },
        });
        expect(result.options.modelConfig?.defaultOptions).toMatchObject({
            provider: {
                "only": ["respan"],
                "ignore": ["cloudflare"],
                "allow_fallbacks": false,
            },
        });
    });

    it("sets Anthropic max_tokens defaults", () => {
        expect(
            resolveModelConfig(messages, {
                model: "anthropic/claude-sonnet-4.6",
            }).options.max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, {
                model: "anthropic/claude-haiku-4.5",
            }).options.max_tokens,
        ).toBe(64000);
        expect(
            resolveModelConfig(messages, { model: "anthropic/claude-opus-5" })
                .options.max_tokens,
        ).toBe(128000);
        expect(
            resolveModelConfig(messages, { model: "anthropic/claude-fable-5" })
                .options.max_tokens,
        ).toBe(128000);
        expect(
            resolveModelConfig(messages, {
                model: "anthropic/claude-fable-5.1",
            }).options.max_tokens,
        ).toBe(128000);
    });

    it("lets callers override Anthropic max_tokens", () => {
        const result = resolveModelConfig(messages, {
            model: "anthropic/claude-sonnet-4.6",
            max_tokens: 1024,
        });

        expect(result.options.max_tokens).toBe(1024);
    });

    it("keeps Kimi K2.6 recovery on direct DeepInfra", () => {
        const resolved = resolveModelConfig(messages, {
            model: "moonshotai/kimi-k2.6:deepinfra",
        });
        expect(resolved.options.modelConfig).toMatchObject({
            "custom-host": "https://api.deepinfra.com/v1/openai",
            model: "moonshotai/Kimi-K2.6",
        });
        expect(findModelByName("moonshotai/kimi-k2.6:azure:sweden")).toBeNull();
    });

    it("routes claude-large to the global Opus 5 profile", () => {
        const result = resolveModelConfig(messages, {
            model: "anthropic/claude-opus-5",
        });

        expect(result.options.model).toBe("global.anthropic.claude-opus-5");
    });

    it("routes openai/gpt-6-astra to the direct Azure Responses deployment", () => {
        const result = resolveModelConfig(messages, {
            model: "openai/gpt-6-astra",
        });

        expect(result.options.model).toBe("gpt-6-astra");
        expect(result.options.modelConfig).toMatchObject({
            provider: "azure-openai",
            "azure-deployment-id": "gpt-6-astra",
            responsesEndpoint:
                "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("keeps GPT-5.3 Codex primary and Sweden fallback routes distinct", () => {
        const primary = resolveModelConfig(messages, {
            model: "openai/gpt-5.3-codex",
        });
        const fallback = findModelByName("openai/gpt-5.3-codex:azure:sweden");

        expect(primary.options.model).toBe("gpt-5.3-codex");
        expect(primary.options.modelConfig).toMatchObject({
            provider: "azure-openai",
            "azure-resource-name": "myceli-prod-eastus",
            "azure-deployment-id": "gpt-5.3-codex",
            responsesEndpoint:
                "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
        });
        expect(fallback?.useResponsesApi).toBe(true);
        expect(fallback?.config()).toMatchObject({
            provider: "azure-openai",
            "azure-resource-name": "myceli-prod-swedencentral",
            "azure-deployment-id": "gpt-5.3-codex",
            responsesEndpoint:
                "https://myceli-prod-swedencentral.openai.azure.com/openai/v1/responses",
        });
    });

    it("does not expose GPT-5.3 Codex through an alias", () => {
        expect(() =>
            resolveModelConfig(messages, { model: "gpt-5.3-codex" }),
        ).toThrow("Model configuration not found for: gpt-5.3-codex");
    });

    it("does not expose gpt-6-astra as an alias", () => {
        expect(() =>
            resolveModelConfig(messages, { model: "gpt-6-astra" }),
        ).toThrow("Model configuration not found for: gpt-6-astra");
    });

    it.each(["gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna"])(
        "routes %s through Azure with direct OpenAI fallback",
        (model) => {
            const canonical = `openai/${model}`;
            const result = resolveModelConfig(messages, { model: canonical });

            expect(result.options.model).toBe(model);
            expect(result.options.modelConfig).toMatchObject({
                provider: "azure-openai",
                "azure-resource-name": "myceli-prod-eastus",
                "azure-deployment-id": model,
                responsesEndpoint:
                    "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses",
            });
            expect(findModelByName(canonical)?.useResponsesApi).toBe(true);
            expect(
                findModelByName(`${canonical}:openai`)?.config(),
            ).toMatchObject({
                provider: "openai",
                model,
                responsesEndpoint: "https://api.openai.com/v1/responses",
            });
            expect(() => resolveModelConfig(messages, { model })).toThrow(
                `Model configuration not found for: ${model}`,
            );
        },
    );

    it("does not set max_tokens for non-Anthropic models", () => {
        const result = resolveModelConfig(messages, {
            model: "openai/gpt-5.4-nano",
        });

        expect(result.options.max_tokens).toBeUndefined();
    });

    it("resolves nova-fast to us.amazon.nova-micro-v1:0", () => {
        const result = resolveModelConfig(messages, {
            model: "amazon/nova-micro-v1",
        });

        expect(result.options.model).toBe("us.amazon.nova-micro-v1:0");
    });

    it("pins Qwen 3.7 Max to the quoted Alibaba endpoint without pricier regions", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.7-max",
        });
        expect(result.options.model).toBe("qwen/qwen3.7-max");
        expect(result.options.max_tokens).toBe(64000);
        expect(result.options.provider).toEqual({
            only: ["alibaba"],
            ignore: ["alibaba/us-east-1", "cloudflare"],
            allow_fallbacks: false,
        });
    });

    it("pins longcat to the exact OpenRouter endpoint without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "meituan/longcat-2.0",
        });

        expect(result.options.model).toBe("meituan/longcat-2.0");
        expect(result.options.provider).toEqual({
            only: ["atlas-cloud/fp8"],
            allow_fallbacks: false,
        });
    });

    it("pins Hy4 Preview to Tencent on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "tencent/hy4-preview",
        });

        expect(result.options.model).toBe("tencent/hy4-preview");
        expect(result.options.max_tokens).toBe(64000);
        expect(result.options.provider).toEqual({
            only: ["tencent/fp8"],
            allow_fallbacks: false,
        });
    });

    it("pins Hy3 to Novita on OpenRouter without fallback", () => {
        expect(findModelByName("tencent/hy3:openrouter:phala")).toBeNull();
        const result = resolveModelConfig(messages, {
            model: "tencent/hy3",
        });

        expect(result.options.model).toBe("tencent/hy3");
        expect(result.options.provider).toEqual({
            only: ["novita"],
            allow_fallbacks: false,
        });
    });

    it("routes Ling 3.1 Flash directly to Novita without gateway routing options", () => {
        const result = resolveModelConfig(messages, {
            model: "inclusionai/ling-3.1-flash",
        });
        expect(result.options.model).toBe("inclusionai/ling-3.1-flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint: "https://api.novita.ai/openai/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("pins Nex N2.5 Mini to Nex AGI on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "nex-agi/nex-n2.5-mini",
        });

        expect(result.options.model).toBe("nex-agi/nex-n2.5-mini");
        expect(result.options.provider).toEqual({
            only: ["nex-agi/bf16"],
            allow_fallbacks: false,
        });
    });

    it("pins Nex N2.5 Pro to Nex AGI on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "nex-agi/nex-n2.5-pro",
        });

        expect(result.options.model).toBe("nex-agi/nex-n2.5-pro");
        expect(result.options.provider).toEqual({
            only: ["nex-agi/fp8"],
            allow_fallbacks: false,
        });
    });

    it("routes Mistral Large 4 to Mistral direct", () => {
        const result = resolveModelConfig(messages, {
            model: "mistralai/mistral-large-4",
        });

        expect(result.options.model).toBe("mistral-large-4");
    });

    it("pins Step 5 Preview to StepFun and its fallback to DeepInfra", () => {
        const primary = resolveModelConfig(messages, {
            model: "stepfun/step-5-preview",
        });
        expect(primary.options.provider).toEqual({
            only: ["stepfun/fp8"],
            allow_fallbacks: false,
        });

        const fallback = resolveModelConfig(messages, {
            model: "stepfun/step-5-preview:vercel",
        });
        expect(fallback.options.providerOptions).toEqual({
            gateway: { only: ["deepinfra"] },
        });
    });

    it("pins the Mistral Large 4 fallback to Mistral on Vercel", () => {
        const result = resolveModelConfig(messages, {
            model: "mistralai/mistral-large-4:vercel",
        });

        expect(result.options.model).toBe("mistral/mistral-large-4");
        expect(result.options.providerOptions).toEqual({
            gateway: { only: ["mistral"] },
        });
    });

    it("pins Ling 3.0 Flash VL to DeepInfra fp16 on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "inclusionai/ling-3.0-flash-vl",
        });

        expect(result.options.model).toBe("inclusionai/ling-3.0-flash-vl");
        expect(result.options.provider).toEqual({
            only: ["deepinfra/fp16"],
            allow_fallbacks: false,
        });
    });

    it("pins GLM-5.3 FlashX to Z.AI on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "z-ai/glm-5.3-flashx",
        });

        expect(result.options.model).toBe("z-ai/glm-5.3-flashx");
        expect(result.options.provider).toEqual({
            only: ["z-ai/fp8"],
            allow_fallbacks: false,
        });
    });

    it("routes Grok 4.7 to xAI with a base-xAI OpenRouter fallback", () => {
        const primary = resolveModelConfig(messages, {
            model: "x-ai/grok-4.7",
        });
        const fallback = resolveModelConfig(messages, {
            model: "x-ai/grok-4.7:openrouter",
        });

        expect(primary.options.model).toBe("grok-4.7");
        expect(primary.options.provider).toBeUndefined();
        expect(fallback.options.model).toBe("x-ai/grok-4.7");
        expect(fallback.options.provider).toEqual({
            only: ["xai"],
            ignore: ["xai/zdr/us", "xai/priority", "xai/zdr/priority"],
            allow_fallbacks: false,
        });
    });

    it.each([
        ["xiaomi/mimo-v2.6-flash", "xiaomimimo/mimo-v2.6-flash"],
        ["xiaomi/mimo-v2.6-pro", "xiaomimimo/mimo-v2.6-pro"],
    ])("routes %s directly to Novita as %s", (model, upstream) => {
        const result = resolveModelConfig(messages, { model });

        expect(result.options.model).toBe(upstream);
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint: "https://api.novita.ai/openai/v1/chat/completions",
            model: upstream,
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Opus 5.5 fast mode through Vercel pinned to Anthropic", () => {
        const result = resolveModelConfig(messages, {
            model: "anthropic/claude-opus-5.5:fast",
        });

        expect(result.options.model).toBe("anthropic/claude-opus-5.5-fast");
        expect(result.options.providerOptions).toEqual({
            gateway: { only: ["anthropic"] },
        });
    });

    it("falls back to OpenRouter's Anthropic fast endpoint for Opus 5.5 fast mode", () => {
        const result = resolveModelConfig(messages, {
            model: "anthropic/claude-opus-5.5:fast:openrouter:anthropic-fast",
        });

        expect(result.options.model).toBe("anthropic/claude-opus-5.5");
        expect(result.options.provider).toEqual({
            only: ["anthropic/fast"],
            allow_fallbacks: false,
        });
    });

    it.each([
        ["anthropic/claude-haiku-5.5", "claude-haiku-5-5"],
        ["anthropic/claude-sonnet-5.5", "claude-sonnet-5-5"],
        ["anthropic/claude-opus-5.5", "claude-opus-5-5"],
        ["anthropic/claude-fable-5.1", "claude-fable-5-1"],
    ])(
        "routes %s to Anthropic with a Bedrock global fallback",
        (model, upstream) => {
            const primary = resolveModelConfig(messages, { model });
            expect(primary.options.model).toBe(upstream);
            expect(primary.options.modelConfig?.provider).toBe("anthropic");
            expect(primary.options.max_tokens).toBe(128000);

            const fallback = resolveModelConfig(messages, {
                model: `${model}:aws`,
            });
            expect(fallback.options.model).toBe(`global.anthropic.${upstream}`);
            expect(fallback.options.modelConfig?.provider).toBe("bedrock");
            expect(fallback.options.max_tokens).toBe(128000);
        },
    );

    it("keeps Grok 4.6 recovery on direct xAI", () => {
        const resolved = resolveModelConfig(messages, {
            model: "x-ai/grok-4.6:xai",
        });
        expect(resolved.options.modelConfig).toMatchObject({
            provider: "openai",
            model: "grok-4.6",
            directEndpoint: "https://api.x.ai/v1/chat/completions",
        });
        expect(findModelByName("x-ai/grok-4.6:azure:sweden")).toBeNull();
    });

    it("pins Jev's exact Vercel version, long context, and OpenRouter backup", () => {
        const primary = resolveModelConfig(messages, {
            model: "typesafe/jev-1.13",
        });
        expect(primary.options.model).toBe("typesafe-ai/jev-1.13.0");
        expect(primary.options.providerOptions).toEqual({
            gateway: { only: ["typesafe-ai"] },
            typesafe: { longContext: true },
        });
        const backup = resolveModelConfig(messages, {
            model: "typesafe/jev-1.13:openrouter:typesafe",
        });
        expect(backup.options.model).toBe("typesafe/jev-1.13");
        expect(backup.options.provider).toEqual({
            only: ["typesafe"],
            ignore: ["cloudflare"],
            allow_fallbacks: false,
        });
    });

    it("pins Inkling to DeepInfra on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "thinkingmachines/inkling-small",
        });

        expect(result.options.model).toBe("thinkingmachines/inkling-small");
        expect(result.options.provider).toEqual({
            only: ["deepinfra"],
            allow_fallbacks: false,
        });
    });

    it("routes GPT-4o Mini directly at Standard pricing with a pinned OpenRouter backup", () => {
        const primary = resolveModelConfig(messages, {
            model: "openai/gpt-4o-mini",
            service_tier: "priority",
        });
        expect(primary.options.model).toBe("gpt-4o-mini");
        expect(primary.options.service_tier).toBe("default");
        expect(primary.options.modelConfig?.directEndpoint).toBe(
            "https://api.openai.com/v1/chat/completions",
        );
        const fallback = resolveModelConfig(messages, {
            model: "openai/gpt-4o-mini:openrouter:openai",
        });
        expect(fallback.options.model).toBe("openai/gpt-4o-mini");
        expect(fallback.options.provider).toEqual({
            only: ["openai"],
            ignore: ["cloudflare"],
            allow_fallbacks: false,
        });
    });

    it("pins Mercury to Inception on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "inception/mercury-2",
        });

        expect(result.options.model).toBe("inception/mercury-2");
        expect(result.options.provider).toEqual({
            only: ["Inception"],
            allow_fallbacks: false,
        });
    });

    it("pins Mercury 3 to Inception on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "inception/mercury-3",
        });

        expect(result.options.model).toBe("inception/mercury-3");
        expect(result.options.provider).toEqual({
            only: ["Inception"],
            allow_fallbacks: false,
        });
    });

    it("pins Mercury 2.5 Preview to Inception on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "inception/mercury-2.5-preview",
        });

        expect(result.options.model).toBe("inception/mercury-2.5-preview");
        expect(result.options.max_tokens).toBe(64000);
        expect(result.options.provider).toEqual({
            only: ["Inception"],
            allow_fallbacks: false,
        });
    });

    it.each([
        "qwen/qwen3-coder-30b-a3b-instruct",
        "qwen3-coder",
        "qwen3-coder-30b-a3b-instruct",
        "qwen-coder",
    ])("routes %s to the pinned OpenRouter coder", (model) => {
        const result = resolveModelConfig(messages, {
            model,
            stop: ["STOP"],
            reasoning_effort: "high",
        });

        expect(result.options.model).toBe("qwen/qwen3-coder-30b-a3b-instruct");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openrouter",
        });
        expect(result.options.modelConfig?.responsesEndpoint).toBeUndefined();
        expect(result.options.provider).toEqual({
            only: ["siliconflow/fp8"],
            ignore: ["cloudflare"],
            allow_fallbacks: false,
        });
        expect(result.messages).toEqual(messages);
    });

    it("retains the exact Bedrock coder as the backup", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3-coder-30b-a3b-instruct:aws",
        });
        expect(result.options.model).toBe("qwen.qwen3-coder-30b-a3b-v1:0");
        expect(result.options.modelConfig).toMatchObject({
            provider: "bedrock",
            "aws-region": "us-east-1",
        });
    });

    it("removes unsupported controls without injecting a coder prompt", async () => {
        const definition = findModelByName("qwen-coder");
        const transformed = await definition?.transform?.(messages, {
            model: "qwen-coder",
            stop: ["STOP"],
            reasoning_effort: "high",
            temperature: 0.2,
        });

        expect(transformed?.messages).toEqual(messages);
        expect(transformed?.options.stop).toBeUndefined();
        expect(transformed?.options.reasoning_effort).toBeUndefined();
        expect(transformed?.options.temperature).toBe(0.2);
    });

    it.each([
        [
            "nvidia/nemotron-3-ultra",
            "accounts/fireworks/models/nemotron-3-ultra-nvfp4",
            "https://api.fireworks.ai/inference/v1",
        ],
        [
            "nvidia/nemotron-3-ultra:deepinfra",
            "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B",
            "https://api.deepinfra.com/v1/openai",
        ],
    ])("routes %s directly to its provider", (model, upstream, host) => {
        const result = resolveModelConfig(messages, { model });

        expect(result.options.model).toBe(upstream);
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": host,
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

    it.each([
        ["inferenceport-ai/lightning-text-v2", "lightning"],
        ["inferenceport-ai/lightning-text-v2.1", "lightning-text-v2.1"],
    ])(
        "routes %s directly to InferencePort without fallback",
        (model, upstream) => {
            const result = resolveModelConfig(messages, { model });

            expect(result.options.model).toBe(upstream);
            expect(result.options.modelConfig).toMatchObject({
                provider: "openai",
                "custom-host": "https://api.inferenceport.ai/v1",
            });
            expect(result.options.provider).toBeUndefined();
        },
    );

    it("routes Step Flash directly to Novita", () => {
        const result = resolveModelConfig(messages, {
            model: "stepfun/step-3.7-flash",
        });

        expect(result.options.model).toBe("stepfun/step-3.7-flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint: "https://api.novita.ai/openai/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("pins the Qwen3.7 Flash OpenRouter fallback away from Alibaba US", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.7-flash:openrouter:alibaba",
        });

        expect(result.options.model).toBe("qwen/qwen3.7-flash");
        expect(result.options.provider).toEqual({
            only: ["Alibaba"],
            ignore: ["alibaba/us-east-1"],
            allow_fallbacks: false,
        });
    });

    it("routes qwen3.7-flash directly to Alibaba", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.7-flash",
        });
        expect(result.options.model).toBe("qwen3.7-flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes qwen3.8-max directly to Alibaba", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.8-max",
        });
        expect(result.options.model).toBe("qwen3.8-max");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Qwen3.8 Max 0902 directly to Alibaba", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.8-max-0902",
        });

        expect(result.options.model).toBe("qwen3.8-max-0902");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            responsesEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/responses",
            responsesApiKeyBinding: "DASHSCOPE_API_KEY",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it.each([
        ["required", "required"],
        [
            "function object",
            {
                type: "function",
                function: { name: "get_weather" },
            },
        ],
    ])(
        "disables Qwen3.8 Max 0902 thinking for %s tool choice",
        async (_label, toolChoice) => {
            const definition = findModelByName("qwen/qwen3.8-max-0902");
            const transformed = await definition?.transform?.(messages, {
                model: "qwen/qwen3.8-max-0902",
                reasoning_effort: "high",
                tool_choice: toolChoice,
            });

            expect(transformed?.options.reasoning_effort).toBe("none");
        },
    );

    it("keeps Qwen3.8 Max 0902 reasoning for automatic tool choice", async () => {
        const definition = findModelByName("qwen/qwen3.8-max-0902");
        const transformed = await definition?.transform?.(messages, {
            model: "qwen/qwen3.8-max-0902",
            reasoning_effort: "high",
            tool_choice: "auto",
        });

        expect(transformed?.options.reasoning_effort).toBe("high");
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

    it("routes qwen3.8-flash directly to Alibaba", () => {
        const result = resolveModelConfig(messages, {
            model: "qwen/qwen3.8-flash",
        });
        expect(result.options.model).toBe("qwen3.8-flash");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            directEndpoint:
                "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it.each([
        ["required", "required"],
        [
            "function object",
            {
                type: "function",
                function: { name: "get_weather" },
            },
        ],
    ])(
        "disables Qwen3.8 Flash thinking for %s tool choice",
        async (_label, toolChoice) => {
            for (const name of [
                "qwen/qwen3.8-flash",
                "qwen/qwen3.8-flash:openrouter:alibaba",
            ]) {
                const definition = findModelByName(name);
                const transformed = await definition?.transform?.(messages, {
                    model: name,
                    reasoning_effort: "high",
                    tool_choice: toolChoice,
                });

                expect(transformed?.options.reasoning_effort).toBe("none");
            }
        },
    );

    it("keeps Qwen3.8 Flash reasoning for automatic tool choice", async () => {
        const definition = findModelByName("qwen/qwen3.8-flash");
        const transformed = await definition?.transform?.(messages, {
            model: "qwen/qwen3.8-flash",
            reasoning_effort: "high",
            tool_choice: "auto",
        });

        expect(transformed?.options.reasoning_effort).toBe("high");
    });

    it("routes Kimi K3 directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "moonshotai/kimi-k3",
        });

        expect(result.options.model).toBe("accounts/fireworks/models/kimi-k3");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes Nemotron 3.5 Super VL directly to DeepInfra with a Together fallback", () => {
        const primary = resolveModelConfig(messages, {
            model: "nvidia/nemotron-3.5-super-vl",
        });
        const fallback = resolveModelConfig(messages, {
            model: "nvidia/nemotron-3.5-super-vl:openrouter:together",
        });

        expect(primary.options.model).toBe(
            "nvidia/NVIDIA-Nemotron-3.5-Super-VL",
        );
        expect(primary.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
        });
        expect(primary.options.provider).toBeUndefined();
        expect(fallback.options.provider).toEqual({
            only: ["together"],
            allow_fallbacks: false,
        });
    });

    it("routes DeepSeek V4.1 Flash 1017 directly to Fireworks with a DeepInfra fallback", () => {
        const primary = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4.1-flash-1017",
        });
        const fallback = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4.1-flash-1017:deepinfra",
        });

        expect(primary.options.model).toBe(
            "accounts/fireworks/models/deepseek-v4p1-flash-1017",
        );
        expect(primary.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(primary.options.provider).toBeUndefined();
        expect(fallback.options.model).toBe(
            "deepseek-ai/DeepSeek-V4.1-Flash-1017",
        );
        expect(fallback.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
        });
    });

    it("routes Muse Glimmer directly to DeepInfra", () => {
        const result = resolveModelConfig(messages, { model: "muse-glimmer" });

        expect(result.options.model).toBe("meta-models/Muse-Glimmer-30B");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
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

    it("routes Muse Spark 1.3 directly through Vercel without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "meta/muse-spark-1.3",
        });

        expect(result.options.model).toBe("meta/muse-spark-1.3");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://ai-gateway.vercel.sh/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("pins Muse Wonder to Meta on OpenRouter", () => {
        const result = resolveModelConfig(messages, {
            model: "meta/muse-wonder-1.0",
        });

        expect(result.options.model).toBe("meta/muse-wonder");
        expect(result.options.provider).toEqual({
            only: ["meta"],
            allow_fallbacks: false,
        });
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

    it("routes full Inkling directly to Fireworks without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "thinkingmachines/inkling",
        });

        expect(result.options.model).toBe("accounts/fireworks/models/inkling");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
        expect(result.options.provider).toBeUndefined();
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
        [
            "mistral-small-3.2",
            "mistralai/mistral-small-3.2-24b-instruct",
            "deepinfra/fp8",
        ],
        ["gemma", "google/gemma-4-26b-a4b-it", "deepinfra/fp8"],
        ["gemma-4-31b", "google/gemma-4-31b-it", "crusoe/bf16"],
        ["mimo-v2.5", "xiaomi/mimo-v2.5", "xiaomi/fp8"],
        ["mimo-v2.5-pro", "xiaomi/mimo-v2.5-pro", "xiaomi/fp8"],
        ["minimax-m2.7", "minimax/minimax-m2.7", "novita/fp8"],
        [
            "minimax/minimax-m2.7:openrouter:minimax",
            "minimax/minimax-m2.7",
            "minimax/fp8",
        ],
        [
            "meta/llama-4-scout:openrouter:novita-bf16",
            "meta-llama/llama-4-scout",
            "novita/bf16",
        ],
    ])(
        "pins %s to %s through %s without fallback",
        (model, route, provider) => {
            const result = resolveModelConfig(messages, { model });

            expect(result.options.model).toBe(route);
            expect(result.options.provider).toEqual({
                only: [provider],
                allow_fallbacks: false,
            });
        },
    );

    it("routes Qwen Vision directly to DeepInfra with an exact gateway backup", () => {
        const primary = resolveModelConfig(messages, { model: "qwen-vision" });
        expect(primary.options.model).toBe("Qwen/Qwen3-VL-30B-A3B-Instruct");
        expect(primary.options.modelConfig?.directEndpoint).toBe(
            "https://api.deepinfra.com/v1/openai/chat/completions",
        );
        expect(primary.options.provider).toBeUndefined();
        const fallback = resolveModelConfig(messages, {
            model: "qwen/qwen3-vl-30b-a3b-instruct:openrouter:deepinfra",
        });
        expect(fallback.options.model).toBe("qwen/qwen3-vl-30b-a3b-instruct");
        expect(fallback.options.provider).toEqual({
            only: ["deepinfra/fp8"],
            ignore: ["deepinfra/fp8/priority", "cloudflare"],
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

    it("pins Mistral Small 4's backup to its quoted standard ZDR endpoint", () => {
        const result = resolveModelConfig(messages, {
            model: "mistralai/mistral-small-4:openrouter",
        });
        expect(result.options.model).toBe("mistralai/mistral-small-2603");
        expect(result.options.max_tokens).toBe(64000);
        expect(result.options.provider).toEqual({
            only: ["mistral/zdr"],
            ignore: ["mistral/eu", "mistral/us", "cloudflare"],
            allow_fallbacks: false,
        });
    });

    it("routes Mistral Small 4 to Mistral's direct API", () => {
        const result = resolveModelConfig(messages, { model: "mistral" });

        expect(result.options.model).toBe("mistral-small-2603");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.mistral.ai/v1",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes DeepSeek to the exact Azure 0731 checkpoint with reasoning on", () => {
        const result = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4-flash",
        });

        expect(result.options.model).toBe("DeepSeek-V4-Flash-0731");
        expect(result.options.modelConfig).toMatchObject({
            provider: "azure-openai",
            "azure-resource-name": "myceli-prod-swedencentral",
            "azure-deployment-id": "DeepSeek-V4-Flash-0731",
        });
        expect(result.options.reasoning_effort).toBe("high");
        expect(
            resolveModelConfig(messages, {
                model: "deepseek/deepseek-v4-flash",
                reasoning_effort: "none",
            }).options.reasoning_effort,
        ).toBe("none");
    });

    it("routes DeepSeek V4.1 Flash to Azure with a Fireworks fallback", () => {
        const primary = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4.1-flash",
        });
        const fireworks = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4.1-flash:fireworks",
        });

        expect(primary.options.model).toBe("DeepSeek-V4.1-Flash");
        expect(primary.options.modelConfig).toMatchObject({
            provider: "azure-openai",
            "azure-resource-name": "myceli-prod-swedencentral",
            "azure-deployment-id": "DeepSeek-V4.1-Flash",
        });
        expect(fireworks.options.model).toBe(
            "accounts/fireworks/models/deepseek-v4p1-flash",
        );
        expect(fireworks.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.fireworks.ai/inference/v1",
        });
    });

    it("routes DeepSeek Vision to the exact DeepInfra vision checkpoint", () => {
        const result = resolveModelConfig(messages, {
            model: "deepseek/deepseek-v4-flash-vision-exp",
        });

        expect(result.options.model).toBe(
            "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp",
        );
        expect(result.options.modelConfig).toMatchObject({
            provider: "openai",
            "custom-host": "https://api.deepinfra.com/v1/openai",
        });
        expect(result.options.provider).toBeUndefined();
    });

    it("routes DeepSeek Pro to the exact 0813 checkpoint on Alibaba", () => {
        const result = resolveModelConfig(messages, { model: "deepseek-pro" });

        expect(result.options.model).toBe("deepseek/deepseek-v4-pro-0813");
        expect(result.options.provider).toEqual({
            only: ["alibaba"],
            ignore: ["alibaba/us-east-1"],
            allow_fallbacks: false,
        });
    });

    it("routes Command A+ to Cohere on OpenRouter without fallback", () => {
        const result = resolveModelConfig(messages, {
            model: "command-a-plus-05-2026",
        });

        expect(result.options.model).toBe("cohere/command-a-plus");
        expect(result.options.modelConfig).toMatchObject({
            provider: "openrouter",
            directEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        });
        expect(result.options.provider).toEqual({
            only: ["Cohere"],
            allow_fallbacks: false,
        });
    });

    it.each([
        "perplexity-high",
        "sonar-deep",
        "perplexity/sonar-pro",
        "sonar-reasoning-pro",
    ])(
        "resolves %s to Sonar with search options on its web_search tool",
        async (modelName) => {
            const model = findModelByName(modelName);
            expect(model?.name).toBe("perplexity/sonar");

            const transformed = await model?.transform?.(messages, {
                model: modelName,
                web_search_options: { search_context_size: "high" },
                search_recency_filter: "day",
                presence_penalty: 1,
            });
            if (!transformed) throw new Error("Sonar transform missing");
            const result = resolveModelConfig(
                transformed.messages,
                transformed.options,
            );
            expect(result.options.model).toBe("perplexity/sonar");
            expect(result.options).not.toHaveProperty("presence_penalty");
            expect(result.options).not.toHaveProperty("web_search_options");
            expect(result.options.modelConfig).toMatchObject({
                responsesEndpoint: "https://api.perplexity.ai/v1/agent",
                responsesDefaults: {
                    tools: [
                        {
                            type: "web_search",
                            search_context_size: "high",
                            filters: { search_recency_filter: "day" },
                        },
                    ],
                },
            });
        },
    );

    it.each([
        ["grok", undefined, "grok-4-20-non-reasoning"],
        ["grok-4-20-reasoning", undefined, "grok-4-20-non-reasoning"],
        ["grok", "high", "grok-4-20-reasoning"],
        ["grok-4-20-reasoning", "none", "grok-4-20-non-reasoning"],
    ] as const)(
        "routes %s with reasoning_effort=%s to %s",
        async (model, reasoningEffort, deployment) => {
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
        },
    );

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

it("excludes Grok 4.3 backup priority endpoints from the quoted price", () => {
    expect(
        resolveModelConfig(messages, {
            model: "x-ai/grok-4.3:openrouter:xai-zdr",
        }).options.provider,
    ).toEqual({
        only: ["xai/zdr"],
        ignore: ["xai/zdr/priority", "cloudflare"],
        allow_fallbacks: false,
    });
});

it("pins Luna Decisions backup to the quoted OpenAI endpoint", () => {
    const { options } = resolveModelConfig(messages, {
        model: "openai/gpt-6-luna-decisions:openrouter",
    });
    expect(options.provider).toEqual({
        only: ["openai"],
        ignore: ["cloudflare"],
        allow_fallbacks: false,
    });
});
