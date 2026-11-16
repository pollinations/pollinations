import { expect, it, vi } from "vitest";
import mappings from "../../../provider-registry.json";
import {
    canonicalProvider,
    initializeProviderRegistry,
    PROVIDER_REGISTRY,
} from "./providerRegistry";

it("keeps canonical IDs and aliases unique and leaves unknown identities unchanged", () => {
    const identities = PROVIDER_REGISTRY.flatMap((vendor) => [
        vendor.id,
        ...vendor.aliases,
    ]);
    expect(new Set(identities).size).toBe(identities.length);
    for (const vendor of PROVIDER_REGISTRY)
        for (const alias of [vendor.id, ...vendor.aliases])
            expect(canonicalProvider(alias)).toBe(vendor.id);
    expect(canonicalProvider("unknown-test-vendor")).toBe(
        "unknown-test-vendor",
    );
});

it("rejects incomplete definitions without replacing the existing catalog", () => {
    const before = PROVIDER_REGISTRY;
    expect(() =>
        initializeProviderRegistry({ version: 1, providers: [] }),
    ).toThrow("incomplete");
    expect(PROVIDER_REGISTRY).toBe(before);
});

it("loads valid journals when a newly registered provider is not onboarded yet", async () => {
    vi.resetModules();
    const registry = await import("./providerRegistry");
    const [known, missing] = mappings.providers;
    registry.initializeProviderRegistry({
        version: 1,
        providers: [
            {
                id: known.id,
                label: "Test vendor",
                category: "compute",
                meteringBasis: "direct",
                connector: null,
                collectionMethod: null,
                monthlyReview: false,
                balanceTracking: false,
            },
        ],
    });
    expect(registry.resolveProvider(known.id)?.label).toBe("Test vendor");
    expect(registry.resolveProvider(missing.id)).toBeUndefined();
    expect(
        registry.missingProviderMappings({
            opPollen: [
                {
                    source: "tinybird",
                    month: "2026-10",
                    vendor: missing.id,
                    model: "test-model",
                    currency: "POLLEN",
                    cost_paid: 1,
                    cost_quests: 0,
                    price_paid: 1,
                    price_quests: 0,
                    byop_paid: 0,
                    byop_quests: 0,
                    model_paid: 0,
                    model_quests: 0,
                    requests_paid: 1,
                    requests_quests: 0,
                },
            ],
        }),
    ).toEqual([
        expect.objectContaining({ provider: missing.id, mapped: false }),
    ]);
});
