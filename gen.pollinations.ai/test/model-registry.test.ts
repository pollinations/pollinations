import { env } from "cloudflare:test";
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
        const configured = availableModels
            .filter(
                (model) =>
                    typeof model.config({ model: model.name })
                        .responsesEndpoint === "string",
            )
            .map((model) => model.name)
            .sort();

        const registry = await getGenerationModelRegistry(env);
        const advertised = registry
            .visibleEntries()
            .filter(
                (entry) =>
                    !entry.communityEndpoint &&
                    entry.supportedEndpoints.includes("/v1/responses"),
            )
            .map((entry) => entry.id)
            .sort();

        expect(configured).toHaveLength(56);
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
