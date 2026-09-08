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
