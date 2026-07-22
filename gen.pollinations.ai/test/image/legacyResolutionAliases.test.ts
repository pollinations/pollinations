import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import { LEGACY_RESOLUTION_ALIASES } from "../../src/image/handler.ts";

// LEGACY_RESOLUTION_ALIASES is derived from registry aliases ending in
// -1080p/-1080. This guards the derivation's semantic assumption: every
// suffix-matching alias must belong to a model that actually declares the
// implied resolution, so the suffix convention can never price a tier the
// model does not serve.
describe("LEGACY_RESOLUTION_ALIASES registry sync", () => {
    const entries = Object.entries(IMAGE_SERVICES) as [
        string,
        ModelDefinition,
    ][];

    it("only contains callable aliases of models that declare the implied resolution", () => {
        expect(Object.keys(LEGACY_RESOLUTION_ALIASES)).not.toHaveLength(0);
        for (const [name, resolution] of Object.entries(
            LEGACY_RESOLUTION_ALIASES,
        )) {
            const owner = entries.find(([, def]) => def.aliases.includes(name));
            expect(owner, `${name} must be a registry alias`).toBeTruthy();
            expect(
                owner?.[1].resolutions,
                `${name}: its model must declare ${resolution}`,
            ).toContain(resolution);
        }
    });
});
