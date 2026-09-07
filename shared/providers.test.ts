import { describe, expect, it } from "vitest";
import registry from "../operations/economics/provider-registry.json";
import { resolveProviderId } from "./providers";
import { getModels, getRegistryModelDefinition } from "./registry/registry";

describe("API provider identities", () => {
    it("keeps vendor IDs and aliases normalized and unambiguous", () => {
        const names = registry.providers.flatMap(({ id, aliases }) => [
            id,
            ...aliases,
        ]);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) {
            expect(name).not.toBe("");
            expect(name).toBe(name.trim().toLowerCase());
        }
    });

    it.each([
        [" BedRock ", "aws"],
        ["aws-bedrock", "aws"],
        ["azure-2", "azure"],
        ["vast", "vast.ai"],
        ["vastai", "vast.ai"],
        ["openrouter", "openrouter"],
    ])("resolves %s to its reviewed vendor %s", (name, expected) => {
        expect(resolveProviderId(name)).toBe(expected);
    });

    it.each([
        "",
        "new-api-provider",
        "open-router",
        "aws-bedrok",
    ])("leaves the unregistered name %s unresolved", (name) =>
        expect(resolveProviderId(name)).toBeUndefined());

    // getModels includes every bundled modality and hidden fallback route.
    // MCP billing and arbitrary community endpoints are outside this contract.
    it.each(
        getModels(),
    )("maps model route %s to a registered vendor", (model) => {
        const { provider } = getRegistryModelDefinition(model);
        expect(provider).toBe(provider.trim().toLowerCase());
        expect(
            resolveProviderId(provider),
            `${model}: register provider "${provider}" in operations/economics/provider-registry.json`,
        ).toBeDefined();
    });
});
