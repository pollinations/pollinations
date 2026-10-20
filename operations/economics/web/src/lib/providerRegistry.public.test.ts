import { expect, it } from "vitest";
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
