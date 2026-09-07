import { env } from "cloudflare:test";
import {
    computeModelHealth,
    type ModelHealthWindow,
    statusForRow,
    unknownModelHealth,
} from "@shared/registry/model-health.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityModelEnv } from "../src/community-models.ts";
import {
    getGenerationModelRegistry,
    resetGenerationModelRegistryCache,
} from "../src/model-registry.ts";
import { availableModels } from "../src/text/availableModels.ts";

vi.mock("../src/routes/model-status.ts", () => ({
    getModelHealthSnapshot: async () => null,
}));

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

describe("model health enrichment", () => {
    const window: ModelHealthWindow = {
        windowMinutes: 1440,
        checkedAt: 1_725_000_000_000,
        stale: false,
    };

    it("classifies status from the 2xx success rate", () => {
        expect(statusForRow({ status_2xx: 1000, errors_5xx: 0 })).toBe(
            "healthy",
        );
        expect(statusForRow({ status_2xx: 950, errors_5xx: 50 })).toBe(
            "degraded",
        );
        expect(statusForRow({ status_2xx: 500, errors_5xx: 500 })).toBe(
            "unavailable",
        );
    });

    it("reports unknown below the minimum sample size", () => {
        expect(statusForRow({ status_2xx: 0, errors_5xx: 0 })).toBe("unknown");
        expect(statusForRow({ status_2xx: 20, errors_5xx: 9 })).toBe("unknown");
    });

    it("computes success rate over 2xx and 5xx only", () => {
        const health = computeModelHealth(
            { model: "flux", status_2xx: 900, errors_5xx: 100 },
            window,
        );
        expect(health.success_rate).toBe(0.9);
        expect(health.sample_size).toBe(1000);
        expect(health.window_minutes).toBe(1440);
        expect(health.checked_at).toBe(
            new Date(window.checkedAt).toISOString(),
        );
        expect(health.stale).toBe(false);
    });

    it("produces an unknown placeholder when there is no sample", () => {
        const health = unknownModelHealth(window);
        expect(health.status).toBe("unknown");
        expect(health.success_rate).toBeNull();
        expect(health.sample_size).toBe(0);
    });

    it("attaches unknown health to entries when the source is unavailable", async () => {
        resetGenerationModelRegistryCache();

        const registry = await getGenerationModelRegistry(env);
        const entries = registry.visibleEntries();

        expect(entries.length).toBeGreaterThan(0);
        expect(entries.every((e) => e.info.health?.status === "unknown")).toBe(
            true,
        );
        expect(entries.every((e) => e.info.health?.stale === true)).toBe(true);
    });
});
