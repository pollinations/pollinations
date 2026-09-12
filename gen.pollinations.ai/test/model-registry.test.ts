import { env } from "cloudflare:test";
import { computeModelHealth } from "@shared/registry/model-health.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityModelEnv } from "../src/community-models.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";
import { availableModels } from "../src/text/availableModels.ts";

afterEach(() => {
    resetGenerationModelRegistryCache();
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
            ["anthropic/claude-sonnet-4.6", "response_format", true],
            ["anthropic/claude-sonnet-5", "temperature", false],
            ["anthropic/claude-sonnet-5", "response_format", false],
            ["anthropic/claude-fable-5.1", "tool_choice", false],
            ["google/gemini-3.7-flash", "temperature", false],
            ["google/gemini-3.7-flash", "stop", true],
            [
                "google/gemini-3.7-flash:openrouter:ai-studio-priority",
                "stop",
                false,
            ],
            ["nvidia/nemotron-3.5-lightning", "top_k", true],
            ["nvidia/nemotron-3-ultra", "top_k", true],
            ["qwen/qwen3-coder-30b-a3b-instruct", "top_k", false],
            ["qwen/qwen3-vl-235b-a22b-thinking", "response_format", false],
            ["perplexity/sonar", "search_domain_filter", true],
            [
                "perplexity/sonar:openrouter:perplexity",
                "search_domain_filter",
                false,
            ],
        ] as const) {
            const parameters = registry.resolve(id)?.info.supported_parameters;
            expect(parameters?.includes(parameter), `${id}: ${parameter}`).toBe(
                supported,
            );
        }
    });

    it("advertises every configured direct Responses model", async () => {
        const registry = await getGenerationModelRegistry(env);
        const configured = availableModels
            .filter(
                (model) =>
                    registry.resolve(model.name)?.visible &&
                    typeof model.config({ model: model.name })
                        .responsesEndpoint === "string",
            )
            .map((model) => model.name)
            .sort();

        const advertised = registry
            .visibleEntries()
            .filter(
                (entry) =>
                    !entry.communityEndpoint &&
                    entry.definition.category === "text" &&
                    entry.supportedEndpoints.includes("/v1/responses"),
            )
            .map((entry) => entry.id)
            .sort();

        expect(advertised).toEqual(configured);
        for (const model of advertised) {
            expect(registry.resolve(model)?.info.supported_endpoints).toContain(
                "/v1/responses",
            );
        }
        expect(advertised).not.toContain("midijourney");
        expect(advertised).not.toContain("midijourney-large");
    });

    it("serves static models when the community catalog query fails", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        resetGenerationModelRegistryCache();
        const healthy = await getGenerationModelRegistry(env);
        const healthyCount = healthy.visibleEntries().length;
        expect(healthyCount).toBeGreaterThan(0);

        resetGenerationModelRegistryCache();
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

describe("computeModelHealth", () => {
    const checkedAt = "2026-09-07T12:00:00.000Z";
    const baseRow = {
        model: "test-model",
        event_type: "generate.text",
        provider: "p",
        model_used: "test-model",
        total_requests: 0,
        errors_4xx: 0,
        own_calls: 0,
        own_calls_ok: 0,
        primary_5xx: 0,
        primary_retried_503s: 0,
        fallback_rescues: 0,
        last_error_at: "",
        latency_p50_ms: null,
        latency_p95_ms: null,
        avg_latency_ms: null,
        last_request_at: "",
        tokens_per_second: null,
    } as const;

    function row(ok: number, fail: number) {
        return { ...baseRow, status_2xx: ok, errors_5xx: fail };
    }

    it("classifies healthy, degraded, and unavailable by 5xx share", () => {
        expect(
            computeModelHealth(row(100, 0), 1440, checkedAt, false).status,
        ).toBe("healthy");
        expect(
            computeModelHealth(row(95, 5), 1440, checkedAt, false).status,
        ).toBe("degraded");
        expect(
            computeModelHealth(row(50, 50), 1440, checkedAt, false).status,
        ).toBe("unavailable");
    });

    it("reports unknown below the minimum sample size", () => {
        const health = computeModelHealth(row(1, 0), 1440, checkedAt, false);
        expect(health.status).toBe("unknown");
        expect(health.sample_size).toBe(1);
        expect(health.success_rate).toBe(1);
    });

    it("propagates window, freshness, and success rate", () => {
        const health = computeModelHealth(row(99, 1), 60, checkedAt, true);
        expect(health.success_rate).toBeCloseTo(0.99, 5);
        expect(health.window_minutes).toBe(60);
        expect(health.checked_at).toBe(checkedAt);
        expect(health.stale).toBe(true);
    });
});
