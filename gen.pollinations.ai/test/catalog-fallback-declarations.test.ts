import {
    getModels,
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";

/**
 * Catalog fallback targets are declared in code and never validated at runtime:
 * `linkFallbackEntries` silently skips an id it cannot resolve, and a bad id
 * that did reach the gateway would 404 — a status that fails over — so a typo
 * degrades to "this model simply never rescues" and nothing anywhere says so.
 *
 * Deliberately only catches MISTAKES, never choices. Whether two models are a
 * sensible pair — comparable modalities, tools, context — is ours to judge when
 * we declare them, and nothing here second-guesses it.
 */
describe("declared catalog fallbacks", () => {
    const declared = getModels().flatMap((id) => {
        const definition = getRegistryModelDefinition(id);
        return (definition.fallbackModels ?? []).map((target) => ({
            id,
            target,
            definition,
        }));
    });

    it("name a model that exists", () => {
        const unresolvable = declared.filter(({ target }) => {
            try {
                resolveModelName(target);
                return false;
            } catch {
                return true;
            }
        });

        expect(unresolvable).toEqual([]);
    });

    it("do not point a model at itself", () => {
        const selfReferential = declared.filter(
            ({ id, target }) => resolveModelName(target) === id,
        );

        expect(selfReferential).toEqual([]);
    });
});
