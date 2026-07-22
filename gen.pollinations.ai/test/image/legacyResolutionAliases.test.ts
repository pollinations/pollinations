import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import { LEGACY_RESOLUTION_ALIASES } from "../../src/image/handler.ts";

// LEGACY_RESOLUTION_ALIASES is the only bridge from legacy suffixed model
// names (veo-1080p, wan-pro-1080p, …) to the resolution they imply. A registry
// alias missing from the table would resolve fine but silently serve and bill
// the base resolution, so the two hand-maintained lists must stay in sync.
describe("LEGACY_RESOLUTION_ALIASES registry sync", () => {
    const entries = Object.entries(IMAGE_SERVICES) as [
        string,
        ModelDefinition,
    ][];

    it("maps every registry alias ending in -1080p/-1080 to 1080p", () => {
        for (const [model, def] of entries) {
            for (const alias of def.aliases) {
                if (/-(1080p|1080)$/.test(alias)) {
                    expect(
                        LEGACY_RESOLUTION_ALIASES[alias],
                        `${model} alias ${alias} must imply 1080p`,
                    ).toBe("1080p");
                }
            }
        }
    });

    it("only contains callable aliases of models that declare the implied resolution", () => {
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
