import { FLUX3_LAUNCH_DISCOUNT_END } from "@shared/registry/image/constants.ts";
import { IMAGE_SERVICES } from "@shared/registry/image/index.ts";
import { mergeFallbacks } from "@shared/registry/merge-fallbacks.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

function modelDefinition(id: string): ModelDefinition {
    return {
        aliases: [],
        provider: "openrouter",
        publisher: "Test",
        category: "image",
        cost: { completionImageTokens: 1 },
        priceMultiplier: 1,
        addedDate: 0,
        title: id,
        paidOnly: false,
    } satisfies ModelDefinition;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("registry loaders", () => {
    describe("route id collisions", () => {
        it("rejects a route that reuses a base model id", () => {
            const base = {
                "a/b": modelDefinition("a/b"),
                "c/d": modelDefinition("c/d"),
            };
            expect(() =>
                mergeFallbacks(base, { "a/b": { "c/d": { provider: "fal" } } }),
            ).toThrow(/reuses the id of base model "c\/d"/);
        });

        it("rejects the same route id under two parents", () => {
            const base = {
                "a/b": modelDefinition("a/b"),
                "c/d": modelDefinition("c/d"),
            };
            expect(() =>
                mergeFallbacks(base, {
                    "a/b": { "shared/route": { provider: "fal" } },
                    "c/d": { "shared/route": { provider: "fal" } },
                }),
            ).toThrow(/declared under more than one parent/);
        });

        it("accepts distinct route ids", () => {
            const base = { "a/b": modelDefinition("a/b") };
            const merged = mergeFallbacks(base, {
                "a/b": { "a/b:fal": { provider: "fal" } },
            });
            expect(Object.keys(merged)).toEqual(["a/b", "a/b:fal"]);
        });
    });

    describe("dynamic pricing", () => {
        it("keeps a getter-based rate live across the mocked-time cutover", () => {
            const model = "black-forest-labs/flux-3-image";
            const service = IMAGE_SERVICES[model];
            const now = vi.spyOn(Date, "now");

            now.mockReturnValue(FLUX3_LAUNCH_DISCOUNT_END - 1);
            expect(Number(service.cost.completionImageTokens)).toBeCloseTo(
                0.024 * 1.055,
                10,
            );

            now.mockReturnValue(FLUX3_LAUNCH_DISCOUNT_END + 1);
            expect(Number(service.cost.completionImageTokens)).toBeCloseTo(
                0.048 * 1.055,
                10,
            );
        });
    });
});
