import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityModelEnv } from "../src/community-models.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";
import { resetModelHealthCache } from "../src/routes/model-status.ts";

const MODEL_HEALTH_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json";

function healthRow(overrides: {
    model: string;
    event_type: string;
    status_2xx: number;
    errors_5xx: number;
}) {
    const { status_2xx, errors_5xx } = overrides;
    return {
        ...overrides,
        provider: "test-provider",
        model_used: overrides.model,
        total_requests: status_2xx + errors_5xx,
        errors_4xx: 0,
        own_calls: status_2xx + errors_5xx,
        own_calls_ok: status_2xx,
        primary_5xx: errors_5xx,
        primary_retried_503s: 0,
        fallback_rescues: 0,
        last_error_at: "1970-01-01 00:00:00",
        latency_p50_ms: null,
        latency_p95_ms: null,
        avg_latency_ms: null,
        last_request_at: "1970-01-01 00:00:00",
        tokens_per_second: null,
    };
}

// Stands in for Tinybird: every model-registry rebuild fetches one health
// snapshot, so tests control it the same way provider tests mock upstream
// APIs (see test/image/ideogramModel.test.ts).
function mockModelHealth(rows: ReturnType<typeof healthRow>[] = []) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const href = typeof input === "string" ? input : input.toString();
        if (!href.startsWith(MODEL_HEALTH_URL)) {
            throw new Error(`Unexpected fetch in test: ${href}`);
        }
        return new Response(JSON.stringify({ data: rows }), {
            headers: { "Content-Type": "application/json" },
        });
    });
}

beforeEach(() => {
    mockModelHealth();
});

afterEach(() => {
    resetGenerationModelRegistryCache();
    resetModelHealthCache();
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

describe("model health enrichment", () => {
    it("reports healthy status for a high success-rate window", async () => {
        mockModelHealth([
            healthRow({
                model: "openai",
                event_type: "generate.text",
                status_2xx: 98,
                errors_5xx: 2,
            }),
        ]);

        const registry = await getGenerationModelRegistry(env);
        const health = registry.resolve("openai")?.info.health;
        expect(health?.status).toBe("healthy");
        expect(health?.success_rate).toBeCloseTo(0.98);
        expect(health?.sample_size).toBe(100);
        expect(health?.window_minutes).toBe(24 * 60);
        expect(health?.stale).toBe(false);
        expect(typeof health?.checked_at).toBe("string");
    });

    it("reports degraded and unavailable status as the failure share rises", async () => {
        mockModelHealth([
            healthRow({
                model: "openai",
                event_type: "generate.text",
                status_2xx: 90,
                errors_5xx: 10,
            }),
        ]);
        expect(
            (await getGenerationModelRegistry(env)).resolve("openai")?.info
                .health?.status,
        ).toBe("degraded");

        resetGenerationModelRegistryCache();
        resetModelHealthCache();
        mockModelHealth([
            healthRow({
                model: "openai",
                event_type: "generate.text",
                status_2xx: 50,
                errors_5xx: 50,
            }),
        ]);
        expect(
            (await getGenerationModelRegistry(env)).resolve("openai")?.info
                .health?.status,
        ).toBe("unavailable");
    });

    it("marks a low-sample or untracked model unknown, never healthy by default", async () => {
        mockModelHealth([
            healthRow({
                model: "openai",
                event_type: "generate.text",
                status_2xx: 3,
                errors_5xx: 0,
            }),
        ]);

        const registry = await getGenerationModelRegistry(env);
        const lowSample = registry.resolve("openai")?.info.health;
        expect(lowSample?.status).toBe("unknown");
        expect(lowSample?.sample_size).toBe(3);

        const untracked = registry.resolve("krea")?.info.health;
        expect(untracked?.status).toBe("unknown");
        expect(untracked?.sample_size).toBe(0);
        expect(untracked?.success_rate).toBeNull();
    });

    it("degrades to unknown rather than healthy when the health source is unavailable", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(
            new Error("network down"),
        );

        const registry = await getGenerationModelRegistry(env);
        const health = registry.resolve("openai")?.info.health;
        expect(health?.status).toBe("unknown");
        expect(health?.checked_at).toBeNull();
        expect(health?.stale).toBe(true);
    });
});
