import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { exports } from "cloudflare:workers";
import type { Fetcher as ScheduledFetcher } from "@cloudflare/workers-types/experimental";
import {
    getModels,
    getRegistryModelDefinition,
    isFreeModel,
} from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type CommunityModelEnv,
    getCommunityModelRegistryEntries,
} from "../src/community-models.ts";
import worker from "../src/index.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";
import {
    availableModels,
    supportsDirectResponses,
} from "../src/text/availableModels.ts";

afterEach(async () => {
    await resetGenerationModelRegistryCache(env);
    vi.restoreAllMocks();
});

// A D1 binding that fails the way schema skew fails: the statement prepares,
// then errors on execution. This is what gen sees in the window between a
// migration landing and the Worker that understands it going live.
function skewedDbBinding(): CloudflareBindings["DB"] {
    // Throws synchronously rather than returning a rejected promise: drizzle
    // probes several statement methods, and the ones it discards would leave
    // unhandled rejections behind.
    const fail = () => {
        throw new Error("D1_ERROR: no such column: agent.config");
    };
    const statement = {
        bind: () => statement,
        all: fail,
        run: fail,
        first: fail,
        raw: fail,
    };
    return {
        prepare: () => statement,
        batch: fail,
        dump: fail,
        exec: fail,
        withSession: () => {
            throw new Error("unused");
        },
    } as unknown as CloudflareBindings["DB"];
}

describe("getGenerationModelRegistry", () => {
    it("requires paid Pollen outside Azure and Fireworks except the approved exceptions", () => {
        const exceptions = new Set([
            "tongyi-mai/z-image-turbo",
            "black-forest-labs/flux.1-schnell",
            "black-forest-labs/flux.2-klein-4b",
            "qwen/qwen3guard-gen-8b",
            "openai/gpt-oss-20b",
            "respan/span-01-lite",
            "vllm-sr/d3",
            "moonshotai/kimi-k3", // Retains Quest access after the AWS move.
            "openai/whisper-large-v3",
            "lykon/dreamshaper-8-lcm",
            // Costs $0 while Vercel offers it as a stealth model.
            "stealth/glyph-cluster",
        ]);
        const questModels = [];
        for (const id of getModels()) {
            const definition = getRegistryModelDefinition(id);
            // Access follows the requested public model, including its internal fallbacks.
            if (definition.fallbackOnly) continue;
            if (["azure", "fireworks"].includes(definition.provider)) continue;
            expect(definition.paidOnly, id).toBe(!exceptions.has(id));
            if (!definition.paidOnly) questModels.push(id);
        }
        expect(new Set(questModels)).toEqual(exceptions);
    });

    it("declares unique Chat controls for every configured route", async () => {
        const registry = await getGenerationModelRegistry(env);
        for (const model of availableModels) {
            const info = registry.resolve(model.name)?.info;
            const parameters = info?.supported_parameters ?? [];
            expect(parameters.length, model.name).toBeGreaterThan(0);
            expect(new Set(parameters).size, model.name).toBe(
                parameters.length,
            );
            for (const internal of [
                "model",
                "messages",
                "stream_options",
                "thinking",
                "thinking_budget",
                "safe",
                "provider",
            ]) {
                expect(parameters, model.name).not.toContain(internal);
            }
        }
    });

    it("keeps provider-specific controls separate instead of inheriting unsupported ones", async () => {
        const registry = await getGenerationModelRegistry(env);
        for (const [id, parameter, supported] of [
            ["openai/gpt-5.4", "temperature", false],
            ["openai/gpt-5.4", "parallel_tool_calls", true],
            ["openai/gpt-5.4-mini", "parallel_tool_calls", false],
            ["openai/gpt-6-astra", "verbosity", false],
            ["openai/gpt-oss-20b", "top_p", true],
            ["openai/gpt-audio-mini", "stream", true],
            ["openai/gpt-audio-1.5", "max_completion_tokens", true],
            ["x-ai/grok-4.3", "max_tokens", true],
            ["x-ai/grok-4.7", "logprobs", false],
            ["x-ai/grok-4.7", "top_logprobs", false],
            ["anthropic/claude-sonnet-4.6", "response_format", true],
            ["anthropic/claude-sonnet-5", "temperature", false],
            ["anthropic/claude-sonnet-5", "response_format", false],
            ["anthropic/claude-fable-5.1", "tool_choice", false],
            ["google/gemini-3.7-flash", "temperature", false],
            ["google/gemini-3.7-flash", "stop", true],
            ["google/gemini-3.7-flash:openrouter:vertex-global", "stop", true],
            ["nvidia/nemotron-3.5-lightning", "top_k", true],
            ["nvidia/nemotron-3.5-lightning", "logprobs", true],
            ["nvidia/nemotron-3.5-lightning:deepinfra", "logprobs", false],
            ["nvidia/nemotron-3-ultra", "top_k", true],
            ["nvidia/nemotron-3-ultra", "logprobs", true],
            ["nvidia/nemotron-3-ultra:deepinfra", "logprobs", false],
            ["meta/muse-spark-open", "tools", true],
            ["meta/muse-spark-open", "reasoning_effort", true],
            ["meta/muse-spark-open", "response_format", false],
            ["meta/muse-spark-open", "seed", false],
            ["nvidia/nemotron-3.5-super-vl", "tools", true],
            ["nvidia/nemotron-3.5-super-vl", "top_k", true],
            ["nvidia/nemotron-3.5-super-vl", "seed", false],
            ["nvidia/nemotron-3.5-super-vl", "logprobs", false],
            ["qwen/qwen3-coder-30b-a3b-instruct", "top_k", false],
            ["qwen/qwen3-vl-235b-a22b-thinking", "response_format", false],
            ["perplexity/sonar", "search_domain_filter", true],
            // Fireworks and the Azure-hosted Fireworks routes serve one choice
            // per request and answer n>1 with "n must be 1 on serverless".
            ["z-ai/glm-5.3", "n", false],
            ["minimax/minimax-m3", "n", false],
            ["nvidia/nemotron-3.5-lightning", "n", false],
            // DeepInfra and OVH do honor n.
            ["deepseek/deepseek-v4.1-flash", "n", true],
            ["openai/gpt-oss-20b", "n", true],
        ] as const) {
            const parameters = registry.resolve(id)?.info.supported_parameters;
            expect(parameters?.includes(parameter), `${id}: ${parameter}`).toBe(
                supported,
            );
        }
    });

    it("keeps the coder's catalog aligned with its serving route", async () => {
        const registry = await getGenerationModelRegistry(env);
        const model = registry.resolve("qwen-coder");

        expect(model?.id).toBe("qwen/qwen3-coder-30b-a3b-instruct");
        expect(model?.definition.provider).toBe("openrouter");
        expect(model?.definition.paidOnly).toBe(true);
        expect(model?.definition.fallbacks).toEqual([
            "qwen/qwen3-coder-30b-a3b-instruct:aws",
        ]);
        // Responses runs through its Chat route; there is no native target.
        expect(model?.supportedEndpoints).toContain("/v1/responses");
        expect(supportsDirectResponses(model?.id ?? "")).toBe(false);
        for (const parameter of ["seed", "logprobs", "stop"]) {
            expect(model?.info.supported_parameters).not.toContain(parameter);
        }
    });

    it("advertises Responses on every text model that serves Chat", async () => {
        const registry = await getGenerationModelRegistry(env);
        const text = registry
            .visibleEntries()
            .filter((entry) => entry.eventType === "generate.text");
        const chat = text.filter((entry) =>
            entry.supportedEndpoints.includes("/v1/chat/completions"),
        );

        expect(chat.length).toBeGreaterThan(0);
        for (const entry of chat) {
            expect(entry.info.supported_endpoints).toContain("/v1/responses");
            expect(entry.info.supported_endpoints).toContain("/v1/messages");
        }
        expect(
            registry.resolve("vllm-sr/d3")?.info.supported_endpoints,
        ).toEqual([
            "/alpha/decisions",
            "/v1/chat/completions",
            "/v1/responses",
            "/v1/messages",
        ]);
        // Native Responses targets stay a subset; the rest are adapted.
        const native = chat.filter((entry) =>
            supportsDirectResponses(entry.id),
        );
        expect(native.length).toBeGreaterThan(0);
        expect(native.length).toBeLessThan(chat.length);
    });

    it("advertises image edits only on models that accept image input", async () => {
        const registry = await getGenerationModelRegistry(env);

        // Text-only models cannot consume a source image, so the endpoint must
        // not be listed where clients look up capabilities.
        for (const id of [
            "black-forest-labs/flux.1-schnell",
            "tongyi-mai/z-image-turbo",
        ]) {
            const entry = registry.resolve(id);
            expect(entry?.supportedEndpoints, id).not.toContain(
                "/v1/images/edits",
            );
            expect(entry?.info.supported_endpoints, id).not.toContain(
                "/v1/images/edits",
            );
        }
        expect(
            registry.resolve("black-forest-labs/flux.1-kontext-pro")
                ?.supportedEndpoints,
        ).toContain("/v1/images/edits");

        for (const entry of registry.visibleEntries()) {
            if (entry.definition.inputModalities?.includes("image")) continue;
            expect(entry.supportedEndpoints, entry.id).not.toContain(
                "/v1/images/edits",
            );
        }
    });

    it("advertises the native video and 3D routes on their categories", async () => {
        const registry = await getGenerationModelRegistry(env);
        const visible = registry.visibleEntries();

        const video = visible.filter(
            (entry) => entry.definition.category === "video",
        );
        expect(video.length).toBeGreaterThan(0);
        for (const entry of video) {
            expect(entry.supportedEndpoints, entry.id).toContain(
                "/video/{prompt}",
            );
            expect(entry.info.supported_endpoints, entry.id).toContain(
                "/video/{prompt}",
            );
            // Video generation is not an image edit.
            expect(entry.supportedEndpoints, entry.id).not.toContain(
                "/v1/images/edits",
            );
        }

        const model3d = visible.filter(
            (entry) => entry.definition.category === "3d",
        );
        expect(model3d.length).toBeGreaterThan(0);
        for (const entry of model3d) {
            expect(entry.supportedEndpoints, entry.id).toContain(
                "/3d/{prompt}",
            );
            expect(entry.info.supported_endpoints, entry.id).toContain(
                "/3d/{prompt}",
            );
            expect(entry.supportedEndpoints, entry.id).not.toContain(
                "/v1/images/edits",
            );
        }
    });

    it("serves the community catalog from KV without querying D1", async () => {
        await resetGenerationModelRegistryCache(env);
        const healthy = await getGenerationModelRegistry(env);

        // A different DB binding misses the in-memory cache; the catalog must
        // still come from KV, so the failing D1 is never reached.
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const fromKv = await getGenerationModelRegistry({
            ...env,
            DB: skewedDbBinding(),
        });
        expect(consoleError).not.toHaveBeenCalled();
        expect(fromKv.visibleEntries().map((e) => e.id)).toEqual(
            healthy.visibleEntries().map((e) => e.id),
        );
    });

    it("refreshes the catalog once on the minute tick before concurrent readers arrive", async () => {
        await resetGenerationModelRegistryCache(env);
        const prepare = vi.spyOn(env.DB, "prepare");
        const context = createExecutionContext();
        await worker.scheduled(
            createScheduledController({ cron: "* * * * *" }),
            env,
            context,
        );
        await waitOnExecutionContext(context);

        // Independent reads bypass the isolate cache, as readers in different
        // locations do. None should fan out another full-catalog D1 query.
        await Promise.all(
            Array.from({ length: 20 }, () =>
                getCommunityModelRegistryEntries(env),
            ),
        );
        expect(
            prepare.mock.calls.filter(([query]) =>
                query.includes('from "community_endpoint"'),
            ),
        ).toHaveLength(1);
        expect(prepare).toHaveBeenCalledTimes(1);
        const { keys } = await env.KV.list({ prefix: "community-catalog:" });
        expect(keys).toHaveLength(1);
        const secondsUntilExpiry =
            (keys[0].expiration ?? 0) - Math.floor(Date.now() / 1000);
        expect(secondsUntilExpiry).toBeGreaterThan(60);
        expect(secondsUntilExpiry).toBeLessThanOrEqual(90);
        expect(
            Number(await env.KV.get("heartbeat:community-catalog")),
        ).toBeCloseTo(Date.now(), -4);
    });

    it("dispatches the catalog cron through the Worker service binding", async () => {
        await resetGenerationModelRegistryCache(env);
        await (
            exports as unknown as { default: ScheduledFetcher }
        ).default.scheduled({
            cron: "* * * * *",
        });
        expect(
            (await env.KV.list({ prefix: "community-catalog:" })).keys,
        ).toHaveLength(1);
    });

    it("refreshes the isolate registry within 30 seconds after a cache loss", async () => {
        await resetGenerationModelRegistryCache(env);
        await getGenerationModelRegistry(env);
        const now = Date.now();
        const { keys } = await env.KV.list({ prefix: "community-catalog:" });
        await env.KV.delete(keys[0].name);
        vi.spyOn(Date, "now").mockReturnValue(now + 30_001);
        const prepare = vi.spyOn(env.DB, "prepare");

        await getGenerationModelRegistry(env);

        expect(prepare).toHaveBeenCalledTimes(1);
    });

    it("reports a failed scheduled refresh while preserving the expiring catalog", async () => {
        await resetGenerationModelRegistryCache(env);
        const entries = await getCommunityModelRegistryEntries(env);
        const before = await env.KV.list({ prefix: "community-catalog:" });
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const context = createExecutionContext();
        const bindings = { ...env, DB: skewedDbBinding() };
        await env.KV.delete("heartbeat:community-catalog");
        await worker.scheduled(
            createScheduledController({ cron: "* * * * *" }),
            bindings,
            context,
        );
        await waitOnExecutionContext(context);

        expect(consoleError).toHaveBeenCalledWith(
            "Community model catalog refresh failed",
            expect.any(Error),
        );
        expect(await getCommunityModelRegistryEntries(bindings)).toEqual(
            entries,
        );
        const { keys } = await env.KV.list({ prefix: "community-catalog:" });
        expect(keys[0].expiration).toBe(before.keys[0].expiration);
        expect(await env.KV.get("heartbeat:community-catalog")).toBeNull();
    });

    it("serves static models when the community catalog query fails", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        await resetGenerationModelRegistryCache(env);
        const healthy = await getGenerationModelRegistry(env);
        const healthyCount = healthy.visibleEntries().length;
        expect(healthyCount).toBeGreaterThan(0);

        await resetGenerationModelRegistryCache(env);
        const degradedEnv: CommunityModelEnv = {
            ...env,
            DB: skewedDbBinding(),
        };
        const degraded = await getGenerationModelRegistry(degradedEnv);

        const entries = degraded.visibleEntries();
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.every((e) => !e.communityEndpoint)).toBe(true);
        expect(consoleError).toHaveBeenCalledWith(
            "Community model registry unavailable",
            expect.any(Error),
        );
    });
});

it("treats a model as free only when no rate or billing rule can charge", () => {
    const paid = getRegistryModelDefinition("openai/gpt-5-nano");
    const free = {
        ...paid,
        cost: { promptTextTokens: 0, completionTextTokens: 0 },
    };
    expect(isFreeModel(paid)).toBe(false);
    expect(isFreeModel(free)).toBe(true);
    expect(
        isFreeModel({
            ...free,
            costVariants: { long: { promptTextTokens: 1e-6 } },
        }),
    ).toBe(false);
    expect(
        isFreeModel({ ...free, billing: { resolveTotalCost: () => 0.01 } }),
    ).toBe(false);
});
