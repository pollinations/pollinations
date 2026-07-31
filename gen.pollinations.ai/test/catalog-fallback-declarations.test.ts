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
 * There is no runtime guard on these pairs by design: we declare both sides in
 * a reviewed PR and are responsible for them. This is where that responsibility
 * gets checked, once, in CI.
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

    it("stay inside the primary's own category", () => {
        // eventTypeForCategory folds image, video and 3D into one event type,
        // so category is the finer check and the one that actually holds a
        // rescue to something the caller can use.
        const mismatched = declared
            .map(({ id, target, definition }) => ({
                id,
                target,
                from: definition.category,
                to: getRegistryModelDefinition(resolveModelName(target))
                    .category,
            }))
            .filter((pair) => pair.from !== pair.to);

        expect(mismatched).toEqual([]);
    });

    it("do not point a model at itself", () => {
        const selfReferential = declared.filter(
            ({ id, target }) => resolveModelName(target) === id,
        );

        expect(selfReferential).toEqual([]);
    });

    it("agree on input modalities, so a rescue can serve the same request", () => {
        // A request carrying an image that fails over to a text-only target
        // comes back as that target's 400 — a caller error, deliberately not
        // retryable — naming a model the caller never asked for.
        const narrower = declared
            .map(({ id, target, definition }) => ({
                id,
                target,
                missing: (definition.inputModalities ?? []).filter(
                    (modality) =>
                        !(
                            getRegistryModelDefinition(resolveModelName(target))
                                .inputModalities ?? []
                        ).includes(modality),
                ),
            }))
            .filter((pair) => pair.missing.length > 0);

        expect(narrower).toEqual([]);
    });
});
